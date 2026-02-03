// Utility functions for validation and formatting

const Utils = {
    // Validate phone number (basic international or local Zambia format)
    isValidPhone(phone) {
        // Allows +260... or 09... or 07...
        const phoneRegex = /^(\+260|0)[79]\d{8}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    },

    // Validate email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Sanitize input to prevent XSS (basic)
    sanitize(input) {
        if (typeof input !== 'string') return input;
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    },

    // Format currency
    formatCurrency(amount, currency = 'ZMW') {
        return new Intl.NumberFormat('en-ZM', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },

    // Validate price report
    validatePriceReport(data) {
        const errors = [];
        if (!data.cropOrLivestock || data.cropOrLivestock.length < 2) errors.push('Valid crop/livestock name required');
        if (!data.pricePerUnit || data.pricePerUnit <= 0) errors.push('Price must be greater than 0');
        if (!data.unit) errors.push('Unit is required');
        if (!data.province) errors.push('Province is required');
        return errors;
    },

    // Validate profile
    validateProfile(data) {
        const errors = [];
        if (!data.first_name || data.first_name.length < 2) errors.push('First name is too short');
        if (!data.last_name || data.last_name.length < 2) errors.push('Last name is too short');
        if (data.phone && !this.isValidPhone(data.phone)) errors.push('Invalid phone number format');
        if (!data.province) errors.push('Province is required');
        if (!data.farmer_type) errors.push('Farmer type is required');
        return errors;
    }
};

// Export
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}
