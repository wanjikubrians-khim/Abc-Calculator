const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Google Sheets Configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/auth/callback';

// OAuth2 Client
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
let sheets = null;
let isAuthenticated = false;

// In-memory data store (in production, use a proper database)
let currentEmployeeData = {};
let calculatedValues = {};

// Socket.IO connections
const connectedClients = new Set();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    connectedClients.add(socket);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients.delete(socket);
    });
});

// Routes

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Explicitly serve CSS files
app.get('/*.css', (req, res) => {
    const cssFile = path.join(__dirname, req.path);
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(cssFile);
});

// Explicitly serve JS files
app.get('/*.js', (req, res) => {
    const jsFile = path.join(__dirname, req.path);
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(jsFile);
});

// Authentication status
app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: isAuthenticated });
});

// Get Google OAuth URL
app.get('/api/auth/url', (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).json({ 
            error: 'Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' 
        });
    }

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    res.json({ authUrl });
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
    const { code, error: authError } = req.query;

    console.log('OAuth callback received:', { code: code ? 'present' : 'missing', authError });

    if (authError) {
        console.error('OAuth authorization error:', authError);
        return res.redirect('/?error=access_denied');
    }

    if (!code) {
        console.error('No authorization code received');
        return res.redirect('/?error=no_code');
    }

    try {
        console.log('Exchanging code for tokens...');
        const { tokens } = await oauth2Client.getAccessToken(code);
        
        console.log('Tokens received, setting credentials...');
        oauth2Client.setCredentials(tokens);
        
        // Initialize Google Sheets API
        console.log('Initializing Google Sheets API...');
        sheets = google.sheets({ version: 'v4', auth: oauth2Client });
        isAuthenticated = true;

        // Initialize the spreadsheet if needed
        console.log('Initializing spreadsheet...');
        await initializeSpreadsheet();

        console.log('Authentication successful, redirecting...');
        res.redirect('/?authenticated=true');
    } catch (error) {
        console.error('Authentication error details:', {
            message: error.message,
            code: error.code,
            status: error.status,
            stack: error.stack
        });
        
        const errorMessage = encodeURIComponent(`Authentication failed: ${error.message}`);
        res.redirect(`/?error=${errorMessage}`);
    }
});

// Create/Update employee data
app.post('/api/employee/create', async (req, res) => {
    if (!isAuthenticated || !sheets) {
        return res.status(401).json({ error: 'Not authenticated with Google Sheets' });
    }

    try {
        const employeeData = req.body;
        currentEmployeeData = employeeData;

        // Write data to Google Sheets
        await writeEmployeeDataToSheets(employeeData);

        // Calculate values
        const calculations = await calculatePayrollValues();
        calculatedValues = calculations;

        // Notify all connected clients
        io.emit('calculationComplete', calculations);

        res.json({ success: true, calculations });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update individual field
app.post('/api/data/update', async (req, res) => {
    if (!isAuthenticated || !sheets) {
        return res.status(401).json({ error: 'Not authenticated with Google Sheets' });
    }

    try {
        const { field, value } = req.body;
        
        // Update in memory
        currentEmployeeData[field] = value;

        // Update in Google Sheets
        await updateFieldInSheets(field, value);

        // Recalculate values
        const calculations = await calculatePayrollValues();
        calculatedValues = calculations;

        // Notify all connected clients
        io.emit('dataUpdated', calculations);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating field:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get latest calculations
app.get('/api/calculations/latest', (req, res) => {
    res.json(calculatedValues);
});

// Google Sheets Functions

async function initializeSpreadsheet() {
    if (!SPREADSHEET_ID) {
        console.warn('GOOGLE_SPREADSHEET_ID not set. Please create a Google Sheet and set the ID in environment variables.');
        return;
    }

    try {
        // Check if spreadsheet exists and has proper structure
        const response = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });

        console.log('Connected to Google Sheets:', response.data.properties.title);

        // Initialize with headers if needed
        await setupSpreadsheetStructure();

    } catch (error) {
        console.error('Error initializing spreadsheet:', error);
        throw new Error('Failed to initialize Google Sheets. Please check your SPREADSHEET_ID.');
    }
}

async function setupSpreadsheetStructure() {
    const headerRow = [
        'Employee Name', 'Employee ID', 'Department', 'Hourly Rate', 
        'Hours per Day', 'Days per Week', 'Weeks per Year', 'Federal Tax Rate (%)',
        'Daily Pay', 'Weekly Pay', 'Monthly Wage', 'Annual Pay',
        'Social Security', 'Medicare', 'WA PFML', 'WA Cares', 'Federal Tax', 'Workers Comp',
        'Total Deductions', 'Net Pay', 'Net Take-Home Pay'
    ];

    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A1:U1',
            valueInputOption: 'RAW',
            resource: {
                values: [headerRow]
            }
        });

        // Set up formulas in row 2
        const formulaRow = [
            '', '', '', '', '', '', '', '', // Input fields (A2:H2)
            '=D2*E2', // Daily Pay (I2)
            '=I2*F2', // Weekly Pay (J2)
            '=J2*G2/12', // Monthly Wage (K2)
            '=J2*G2', // Annual Pay (L2)
            '=L2*0.062', // Social Security (M2)
            '=L2*0.0145', // Medicare (N2)
            '=L2*0.005794', // WA PFML (O2)
            '=L2*0.0058', // WA Cares (P2)
            '=L2*(H2/100)', // Federal Tax (Q2)
            '=L2*0.007963', // Workers Comp (R2)
            '=M2+N2+O2+P2+Q2+R2', // Total Deductions (S2)
            '=L2-S2', // Net Pay (T2)
            '=T2' // Net Take-Home Pay (U2)
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A2:U2',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [formulaRow]
            }
        });

        console.log('Spreadsheet structure initialized with formulas');

    } catch (error) {
        console.error('Error setting up spreadsheet structure:', error);
    }
}

async function writeEmployeeDataToSheets(employeeData) {
    const dataRow = [
        employeeData.employeeName,
        employeeData.employeeId,
        employeeData.department,
        parseFloat(employeeData.hourlyRate),
        parseFloat(employeeData.hoursPerDay),
        parseFloat(employeeData.daysPerWeek),
        parseFloat(employeeData.weeksPerYear),
        parseFloat(employeeData.federalTaxRate)
    ];

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'A2:H2',
        valueInputOption: 'RAW',
        resource: {
            values: [dataRow]
        }
    });

    console.log('Employee data written to Google Sheets');
}

async function updateFieldInSheets(fieldName, value) {
    // Map field names to column letters
    const fieldMap = {
        'employeeName': 'A2',
        'employeeId': 'B2',
        'department': 'C2',
        'hourlyRate': 'D2',
        'hoursPerDay': 'E2',
        'daysPerWeek': 'F2',
        'weeksPerYear': 'G2',
        'federalTaxRate': 'H2'
    };

    const range = fieldMap[fieldName];
    if (!range) return;

    const cellValue = isNaN(parseFloat(value)) ? value : parseFloat(value);

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'RAW',
        resource: {
            values: [[cellValue]]
        }
    });

    console.log(`Updated ${fieldName} to ${value} in Google Sheets`);
}

async function calculatePayrollValues() {
    try {
        // Read calculated values from Google Sheets
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'I2:U2', // Calculated columns
        });

        const values = response.data.values;
        if (!values || values.length === 0) {
            return {};
        }

        const row = values[0];
        
        const calculations = {
            dailyPay: parseFloat(row[0]) || 0,
            weeklyPay: parseFloat(row[1]) || 0,
            monthlyWage: parseFloat(row[2]) || 0,
            annualPay: parseFloat(row[3]) || 0,
            grossAnnualPay: parseFloat(row[3]) || 0,
            socialSecurity: parseFloat(row[4]) || 0,
            medicare: parseFloat(row[5]) || 0,
            waPfml: parseFloat(row[6]) || 0,
            waCares: parseFloat(row[7]) || 0,
            federalTax: parseFloat(row[8]) || 0,
            workersComp: parseFloat(row[9]) || 0,
            totalDeductions: parseFloat(row[10]) || 0,
            netPay: parseFloat(row[11]) || 0,
            netTakeHomePay: parseFloat(row[12]) || 0
        };

        return calculations;

    } catch (error) {
        console.error('Error calculating payroll values:', error);
        return {};
    }
}

// Real-time sync with Google Sheets
setInterval(async () => {
    if (isAuthenticated && sheets && connectedClients.size > 0) {
        try {
            const newCalculations = await calculatePayrollValues();
            
            // Check if values have changed
            const hasChanged = JSON.stringify(newCalculations) !== JSON.stringify(calculatedValues);
            
            if (hasChanged) {
                calculatedValues = newCalculations;
                io.emit('dataUpdated', newCalculations);
                console.log('Real-time sync: Values updated from Google Sheets');
            }
        } catch (error) {
            console.error('Real-time sync error:', error);
        }
    }
}, 5000); // Check every 5 seconds

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Payroll Calculator server running on http://localhost:${PORT}`);
    console.log('Make sure to set the following environment variables:');
    console.log('- GOOGLE_CLIENT_ID');
    console.log('- GOOGLE_CLIENT_SECRET');
    console.log('- GOOGLE_SPREADSHEET_ID');
    console.log('- GOOGLE_REDIRECT_URL (optional, defaults to http://localhost:3000/auth/callback)');
});
