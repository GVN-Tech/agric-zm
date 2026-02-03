class Toast {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
        
        // Add styles dynamically
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 9999;
                pointer-events: none;
            }
            .toast {
                background: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 300px;
                max-width: 90vw;
                animation: slideUp 0.3s ease-out forwards;
                pointer-events: auto;
                font-size: 14px;
            }
            .toast.success { background: var(--success, #10b981); }
            .toast.error { background: var(--error, #ef4444); }
            .toast.info { background: var(--info, #3b82f6); }
            .toast.warning { background: var(--warning, #f59e0b); color: #000; }
            
            .toast-icon { font-size: 18px; }
            .toast-message { flex: 1; }
            .toast-close { cursor: pointer; opacity: 0.7; font-size: 18px; }
            .toast-close:hover { opacity: 1; }
            
            @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(20px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <span class="toast-close" onclick="this.parentElement.remove()">×</span>
        `;

        this.container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    success(message) { this.show(message, 'success'); }
    error(message) { this.show(message, 'error'); }
    warning(message) { this.show(message, 'warning'); }
    info(message) { this.show(message, 'info'); }
}

window.addEventListener('DOMContentLoaded', () => {
    window.Toast = new Toast();
});
