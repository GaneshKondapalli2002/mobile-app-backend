const fs = require('fs');
const path = require('path');
const pdf = require('pdfkit');

const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

function createJobCheckoutPDF(jobId, callback) {
    const filePath = path.join(tempDir, `JobCheckout_${jobId}.pdf`);
    const doc = new pdf();

    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(25).text('Job Checkout Details', 100, 80);
    doc.text(`Job ID: ${jobId}`, 100, 180);
    // Add more content to the PDF as needed

    doc.end();

    fs.createWriteStream(filePath).on('error', (err) => {
        console.error('Error writing PDF file:', err);
        callback(err);
    }).on('finish', () => {
        console.log('PDF file created successfully:', filePath);
        callback(null, filePath);
    });
}

// Example function to handle job checkout
exports.handleJobCheckout = (req, res) => {
    const jobId = req.params.jobId;

    createJobCheckoutPDF(jobId, (err, filePath) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to create PDF' });
        }

        // Handle successful PDF creation
        res.json({ message: 'PDF created successfully', filePath });
    });
};
