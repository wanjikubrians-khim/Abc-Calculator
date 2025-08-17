# Payroll Calculator with Google Sheets Integration

A web-based payroll calculator that uses Google Sheets as the calculation engine and data storage backend. This application demonstrates real-time bidirectional synchronization between a web interface and Google Sheets.

## Features

- **Three-Step Interface**: Employee Information → Wage Calculator → Cost Breakdown
- **Real-Time Synchronization**: Changes in Google Sheets reflect in the web interface within 5 seconds
- **Google Sheets Integration**: All calculations performed in Google Sheets using formulas
- **OAuth2 Authentication**: Secure Google authentication
- **Comprehensive Calculations**: 
  - Wage calculations (daily, weekly, monthly, annual)
  - Tax deductions (Social Security, Medicare, WA PFML, WA Cares, Federal Income Tax, Workers Comp)
  - Net pay calculations

## Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **API Integration**: Google Sheets API v4
- **Authentication**: Google OAuth2

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- Google Cloud Console account
- Google Sheets account

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create OAuth2 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized redirect URI: `http://localhost:3000/auth/callback`
   - Save the Client ID and Client Secret

### 3. Google Sheets Setup

1. Create a new Google Sheet
2. Copy the Spreadsheet ID from the URL (the long string between `/d/` and `/edit`)
3. The application will automatically set up the required structure and formulas

### 4. Application Setup

1. **Clone and Install Dependencies**
   ```bash
   cd payroll-calculator
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_SPREADSHEET_ID=your_google_spreadsheet_id_here
   GOOGLE_REDIRECT_URL=http://localhost:3000/auth/callback
   PORT=3000
   ```

3. **Start the Application**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Open http://localhost:3000 in your browser
   - Complete Google OAuth2 authentication
   - Start using the payroll calculator

## Application Structure

```
payroll-calculator/
├── index.html          # Main application interface
├── styles.css          # Application styling
├── app.js             # Frontend JavaScript
├── server.js          # Node.js backend server
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
└── README.md          # This documentation
```

## Google Sheets Structure

The application automatically creates the following structure in your Google Sheet:

### Row 1 (Headers):
- A1: Employee Name
- B1: Employee ID  
- C1: Department
- D1: Hourly Rate
- E1: Hours per Day
- F1: Days per Week
- G1: Weeks per Year
- H1: Federal Tax Rate (%)
- I1: Daily Pay
- J1: Weekly Pay
- K1: Monthly Wage
- L1: Annual Pay
- M1: Social Security
- N1: Medicare
- O1: WA PFML
- P1: WA Cares
- Q1: Federal Tax
- R1: Workers Comp
- S1: Total Deductions
- T1: Net Pay
- U1: Net Take-Home Pay

### Row 2 (Data and Formulas):
- A2-H2: User input data
- I2: `=D2*E2` (Daily Pay)
- J2: `=I2*F2` (Weekly Pay)
- K2: `=J2*G2/12` (Monthly Wage)
- L2: `=J2*G2` (Annual Pay)
- M2: `=L2*0.062` (Social Security 6.2%)
- N2: `=L2*0.0145` (Medicare 1.45%)
- O2: `=L2*0.005794` (WA PFML 0.5794%)
- P2: `=L2*0.0058` (WA Cares 0.58%)
- Q2: `=L2*(H2/100)` (Federal Tax - user input rate)
- R2: `=L2*0.007963` (Workers Comp 0.7963%)
- S2: `=M2+N2+O2+P2+Q2+R2` (Total Deductions)
- T2: `=L2-S2` (Net Pay)
- U2: `=T2` (Net Take-Home Pay)

## API Endpoints

### Authentication
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/url` - Get Google OAuth2 URL
- `GET /auth/callback` - OAuth2 callback handler

### Data Management
- `POST /api/employee/create` - Create/update employee data
- `POST /api/data/update` - Update individual field
- `GET /api/calculations/latest` - Get latest calculations

## Real-Time Synchronization

The application implements bidirectional synchronization:

1. **Web → Sheets**: User inputs are immediately written to Google Sheets
2. **Sheets → Web**: Changes in Google Sheets are detected every 5 seconds and pushed to connected clients
3. **Socket.IO**: Real-time updates to all connected clients

## Testing the Real-Time Feature

1. Open the application in your browser
2. Complete Steps 1 and 2 to see calculated values
3. Open your Google Sheet in another tab
4. Modify any formula in the spreadsheet (e.g., change the Social Security rate from 0.062 to 0.07)
5. Within 5 seconds, you should see the values update in the web interface

## Deduction Rates

The application uses these standard deduction rates:
- Social Security: 6.2%
- Medicare: 1.45% 
- WA PFML: 0.5794%
- WA Cares: 0.58%
- Federal Income Tax: User input (percentage)
- L.N.I (Workers Comp): 0.7963%

## Error Handling

The application includes comprehensive error handling for:
- Google API authentication failures
- Network connectivity issues
- Invalid input validation
- Google Sheets API rate limits
- Real-time sync failures

## Security Considerations

- OAuth2 secure authentication
- Environment variables for sensitive data
- Input validation and sanitization
- CORS configuration for cross-origin requests

## Deployment

For production deployment:

1. Update the `GOOGLE_REDIRECT_URL` in your `.env` file
2. Add the production redirect URL to your Google Cloud Console OAuth2 configuration
3. Use a process manager like PM2 for Node.js applications
4. Set up HTTPS for secure communication

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check your Google Client ID and Secret
   - Verify redirect URL matches Google Cloud Console configuration
   - Ensure Google Sheets API is enabled

2. **Spreadsheet Not Found**
   - Verify the GOOGLE_SPREADSHEET_ID is correct
   - Ensure the Google Sheet is accessible by your authenticated account

3. **Real-time Sync Not Working**
   - Check browser console for WebSocket connection errors
   - Verify Google Sheets API quota limits
   - Check server logs for sync errors

4. **Formula Errors in Google Sheets**
   - Manually verify formulas in the spreadsheet
   - Ensure all referenced cells contain numeric values
   - Check for circular reference errors

## Support and Development

This application was developed as a technical demonstration of Google Sheets API integration with real-time web applications. The code is well-documented and follows modern JavaScript best practices.

For questions or issues, check the browser console and server logs for detailed error messages.

## License

MIT License - feel free to use and modify for your projects.
