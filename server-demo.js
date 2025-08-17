const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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
app.use(express.static(path.join(__dirname)));

// Demo mode data storage
let currentEmployeeData = {};
let calculatedValues = {};
let isAuthenticated = true; // Demo mode - always authenticated

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

// Authentication status (demo mode)
app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: true, demo: true });
});

// Get Google OAuth URL (demo mode)
app.get('/api/auth/url', (req, res) => {
    res.json({ authUrl: '/', demo: true, message: 'Demo mode - no authentication required' });
});

// OAuth callback (demo mode)
app.get('/auth/callback', async (req, res) => {
    res.redirect('/#step1');
});

// Create/Update employee data
app.post('/api/employee/create', async (req, res) => {
    try {
        const employeeData = req.body;
        currentEmployeeData = employeeData;

        console.log('📝 Employee data received:', employeeData);

        // Calculate values (simulate Google Sheets calculations)
        const calculations = calculatePayrollValues(employeeData);
        calculatedValues = calculations;

        console.log('💰 Calculations completed:', calculations);

        // Notify all connected clients
        io.emit('calculationComplete', calculations);

        res.json({ success: true, calculations, demo: true });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update individual field
app.post('/api/data/update', async (req, res) => {
    try {
        const { field, value } = req.body;
        
        // Update in memory
        currentEmployeeData[field] = value;

        console.log(`🔄 Updated ${field} to ${value}`);

        // Recalculate values
        const calculations = calculatePayrollValues(currentEmployeeData);
        calculatedValues = calculations;

        // Notify all connected clients
        io.emit('dataUpdated', calculations);

        res.json({ success: true, demo: true });
    } catch (error) {
        console.error('Error updating field:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get latest calculations
app.get('/api/calculations/latest', (req, res) => {
    res.json(calculatedValues);
});

// Calculate payroll values (simulating Google Sheets formulas)
function calculatePayrollValues(employeeData) {
    if (!employeeData.hourlyRate) return {};

    const hourlyRate = parseFloat(employeeData.hourlyRate);
    const hoursPerDay = parseFloat(employeeData.hoursPerDay);
    const daysPerWeek = parseFloat(employeeData.daysPerWeek);
    const weeksPerYear = parseFloat(employeeData.weeksPerYear);
    const federalTaxRate = parseFloat(employeeData.federalTaxRate) / 100;

    // Wage calculations (matching Google Sheets formulas)
    const dailyPay = hourlyRate * hoursPerDay;                    // =D2*E2
    const weeklyPay = dailyPay * daysPerWeek;                     // =I2*F2
    const monthlyWage = weeklyPay * weeksPerYear / 12;            // =J2*G2/12
    const annualPay = weeklyPay * weeksPerYear;                   // =J2*G2

    // Deductions (exact percentages from assignment)
    const socialSecurity = annualPay * 0.062;                    // =L2*0.062
    const medicare = annualPay * 0.0145;                         // =L2*0.0145
    const waPfml = annualPay * 0.005794;                         // =L2*0.005794
    const waCares = annualPay * 0.0058;                          // =L2*0.0058
    const federalTax = annualPay * federalTaxRate;               // =L2*(H2/100)
    const workersComp = annualPay * 0.007963;                    // =L2*0.007963

    const totalDeductions = socialSecurity + medicare + waPfml + waCares + federalTax + workersComp;  // =M2+N2+O2+P2+Q2+R2
    const netPay = annualPay - totalDeductions;                  // =L2-S2
    const netTakeHomePay = netPay;                               // =T2

    return {
        dailyPay,
        weeklyPay,
        monthlyWage,
        annualPay,
        grossAnnualPay: annualPay,
        socialSecurity,
        medicare,
        waPfml,
        waCares,
        federalTax,
        workersComp,
        totalDeductions,
        netPay,
        netTakeHomePay
    };
}

// Real-time sync simulation (demo mode)
setInterval(() => {
    if (connectedClients.size > 0 && Object.keys(currentEmployeeData).length > 0) {
        // Simulate checking for changes (in real mode, this would check Google Sheets)
        const newCalculations = calculatePayrollValues(currentEmployeeData);
        
        // Check if values have changed
        const hasChanged = JSON.stringify(newCalculations) !== JSON.stringify(calculatedValues);
        
        if (hasChanged) {
            calculatedValues = newCalculations;
            io.emit('dataUpdated', newCalculations);
            console.log('🔄 Real-time sync: Values updated (demo mode)');
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
    console.log('🚀 ========================================');
    console.log(`🎯 ABC Company Payroll Calculator`);
    console.log(`📊 Demo Mode - Running on http://localhost:${PORT}`);
    console.log('🚀 ========================================');
    console.log('');
    console.log('✨ Features available in demo mode:');
    console.log('   • Three-step payroll calculator interface');
    console.log('   • Real-time calculations (simulated)');
    console.log('   • All deduction percentages as specified');
    console.log('   • WebSocket real-time updates');
    console.log('   • Professional UI/UX');
    console.log('');
    console.log('🔧 For full Google Sheets integration:');
    console.log('   • Set up Google Cloud Console credentials');
    console.log('   • Update .env with real API credentials');  
    console.log('   • Use server.js instead of server-demo.js');
    console.log('');
    console.log('🌐 Open http://localhost:3000 to start using the calculator!');
    console.log('========================================');
});
