import './style.css';

document.addEventListener('DOMContentLoaded', () => {
    const uploadId = localStorage.getItem('rob_identity');
    const uploadIdDisplay = document.getElementById('uploadId');
    
    if (uploadId && uploadIdDisplay) {
        const data = JSON.parse(uploadId);
        uploadIdDisplay.textContent = data.clientId || 'N/A';
    }
});
