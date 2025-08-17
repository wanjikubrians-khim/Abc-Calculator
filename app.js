// Payroll Calculator Frontend
class PayrollCalculator {
    constructor() {
        this.currentStep = 1;
        this.employeeData = {};
        this.calculatedData = {};
        this.socket = null;
        this.syncInterval = null;
        this.isAuthenticated = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSocketConnection();
        this.checkAuthenticationStatus();
        this.startRealTimeSync();
    }

    setupEventListeners() {
        // Form submission
        document.getElementById('employeeForm').addEventListener('submit', (e) => {
            this.handleEmployeeFormSubmit(e);
        });

        // Input change listeners for real-time sync
        const inputs = document.querySelectorAll('#employeeForm input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.debounce(() => {
                    this.syncInputToSheets(input.name, input.value);
                }, 1000)();
            });
        });
    }

    initializeSocketConnection() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateSyncStatus('Connected', 'connected');
        });

        this.socket.on('disconnect', () => {
            this.updateSyncStatus('Disconnected', 'error');
        });

        this.socket.on('dataUpdated', (data) => {
            this.handleDataUpdate(data);
        });

        this.socket.on('calculationComplete', (calculations) => {
            this.updateCalculatedValues(calculations);
        });

        this.socket.on('error', (error) => {
            this.showError(error.message);
            this.updateSyncStatus('Error', 'error');
        });
    }

    async checkAuthenticationStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (!data.authenticated) {
                await this.authenticateWithGoogle();
            } else {
                this.isAuthenticated = true;
                this.updateSyncStatus('Ready', 'connected');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showError('Authentication check failed');
        }
    }

    async authenticateWithGoogle() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/auth/url');
            const data = await response.json();
            
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            this.showError('Failed to initiate Google authentication');
            this.showLoading(false);
        }
    }

    async handleEmployeeFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const employeeData = Object.fromEntries(formData.entries());
        
        // Validate data
        if (!this.validateEmployeeData(employeeData)) {
            return;
        }

        this.employeeData = employeeData;
        
        try {
            this.showLoading(true);
            this.updateSyncStatus('Syncing...', 'syncing');
            
            // Send data to Google Sheets
            const response = await fetch('/api/employee/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(employeeData)
            });

            if (!response.ok) {
                throw new Error('Failed to save employee data');
            }

            const result = await response.json();
            
            // Wait for calculations
            await this.waitForCalculations();
            
            this.goToStep(2);
            this.updateSyncStatus('Synced', 'connected');
            
        } catch (error) {
            this.showError(`Error saving employee data: ${error.message}`);
            this.updateSyncStatus('Error', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async waitForCalculations() {
        // Wait for Google Sheets to calculate values
        return new Promise((resolve) => {
            const checkCalculations = async () => {
                try {
                    const response = await fetch('/api/calculations/latest');
                    const calculations = await response.json();
                    
                    if (calculations && calculations.annualPay > 0) {
                        this.calculatedData = calculations;
                        resolve(calculations);
                    } else {
                        setTimeout(checkCalculations, 1000);
                    }
                } catch (error) {
                    setTimeout(checkCalculations, 1000);
                }
            };
            
            checkCalculations();
        });
    }

    async syncInputToSheets(fieldName, value) {
        if (!this.isAuthenticated) return;
        
        try {
            await fetch('/api/data/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    field: fieldName,
                    value: value
                })
            });
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    startRealTimeSync() {
        // Poll for changes every 3 seconds
        this.syncInterval = setInterval(async () => {
            if (!this.isAuthenticated) return;
            
            try {
                const response = await fetch('/api/calculations/latest');
                const calculations = await response.json();
                
                if (calculations) {
                    this.updateCalculatedValues(calculations);
                }
            } catch (error) {
                console.error('Real-time sync failed:', error);
            }
        }, 3000);
    }

    updateCalculatedValues(calculations) {
        // Update Step 2 - Wage Calculator
        if (calculations.dailyPay !== undefined) {
            document.getElementById('dailyPay').textContent = this.formatCurrency(calculations.dailyPay);
        }
        if (calculations.weeklyPay !== undefined) {
            document.getElementById('weeklyPay').textContent = this.formatCurrency(calculations.weeklyPay);
        }
        if (calculations.monthlyWage !== undefined) {
            document.getElementById('monthlyWage').textContent = this.formatCurrency(calculations.monthlyWage);
        }
        if (calculations.annualPay !== undefined) {
            document.getElementById('annualPay').textContent = this.formatCurrency(calculations.annualPay);
        }

        // Update Step 3 - Cost Breakdown
        if (calculations.grossAnnualPay !== undefined) {
            document.getElementById('grossAnnualPay').textContent = this.formatCurrency(calculations.grossAnnualPay);
        }
        if (calculations.socialSecurity !== undefined) {
            document.getElementById('socialSecurity').textContent = this.formatCurrency(calculations.socialSecurity);
        }
        if (calculations.medicare !== undefined) {
            document.getElementById('medicare').textContent = this.formatCurrency(calculations.medicare);
        }
        if (calculations.waPfml !== undefined) {
            document.getElementById('waPfml').textContent = this.formatCurrency(calculations.waPfml);
        }
        if (calculations.waCares !== undefined) {
            document.getElementById('waCares').textContent = this.formatCurrency(calculations.waCares);
        }
        if (calculations.federalTax !== undefined) {
            document.getElementById('federalTax').textContent = this.formatCurrency(calculations.federalTax);
        }
        if (calculations.workersComp !== undefined) {
            document.getElementById('workersComp').textContent = this.formatCurrency(calculations.workersComp);
        }
        if (calculations.totalDeductions !== undefined) {
            document.getElementById('totalDeductions').textContent = this.formatCurrency(calculations.totalDeductions);
        }
        if (calculations.netPay !== undefined) {
            document.getElementById('netPay').textContent = this.formatCurrency(calculations.netPay);
        }
        if (calculations.netTakeHomePay !== undefined) {
            document.getElementById('netTakeHomePay').textContent = this.formatCurrency(calculations.netTakeHomePay);
        }

        // Update employee summary
        if (this.employeeData.employeeName) {
            document.getElementById('employeeSummary').textContent = 
                `Employee: ${this.employeeData.employeeName} (ID: ${this.employeeData.employeeId})`;
        }

        this.calculatedData = calculations;
    }

    validateEmployeeData(data) {
        const required = ['employeeName', 'employeeId', 'department', 'hourlyRate', 
                         'hoursPerDay', 'daysPerWeek', 'weeksPerYear', 'federalTaxRate'];
        
        for (let field of required) {
            if (!data[field] || data[field].trim() === '') {
                this.showError(`Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
                return false;
            }
        }

        // Validate numeric fields
        const numericFields = ['hourlyRate', 'hoursPerDay', 'daysPerWeek', 'weeksPerYear', 'federalTaxRate'];
        for (let field of numericFields) {
            const value = parseFloat(data[field]);
            if (isNaN(value) || value < 0) {
                this.showError(`Please enter a valid ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
                return false;
            }
        }

        // Additional validations
        if (parseFloat(data.hoursPerDay) > 24) {
            this.showError('Hours per day cannot exceed 24');
            return false;
        }

        if (parseFloat(data.daysPerWeek) > 7) {
            this.showError('Days per week cannot exceed 7');
            return false;
        }

        if (parseFloat(data.weeksPerYear) > 52) {
            this.showError('Weeks per year cannot exceed 52');
            return false;
        }

        if (parseFloat(data.federalTaxRate) > 50) {
            this.showError('Federal tax rate seems too high (>50%)');
            return false;
        }

        return true;
    }

    goToStep(step) {
        // Update current step
        this.currentStep = step;

        // Update progress bar
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.querySelector(`.step[data-step="${step}"]`).classList.add('active');

        // Update step content
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`step${step}`).classList.add('active');

        // Update URL hash
        window.location.hash = `step${step}`;
    }

    handleDataUpdate(data) {
        // Handle real-time data updates from Google Sheets
        console.log('Data updated from Google Sheets:', data);
        this.updateCalculatedValues(data);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        const errorText = errorDiv.querySelector('p');
        errorText.textContent = message;
        errorDiv.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        document.getElementById('errorMessage').classList.add('hidden');
    }

    updateSyncStatus(text, status) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');
        
        statusText.textContent = text;
        statusIndicator.className = `status-indicator ${status}`;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    destroy() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Global functions for navigation
function goToStep(step) {
    window.payrollCalculator.goToStep(step);
}

function hideError() {
    window.payrollCalculator.hideError();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.payrollCalculator = new PayrollCalculator();
    
    // Handle browser back/forward buttons
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash;
        if (hash.startsWith('#step')) {
            const step = parseInt(hash.replace('#step', ''));
            if (step >= 1 && step <= 3) {
                window.payrollCalculator.goToStep(step);
            }
        }
    });
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.payrollCalculator) {
        window.payrollCalculator.destroy();
    }
});
