const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const Bottleneck = require('bottleneck');
const handlebars = require('handlebars');
require('dotenv').config();

// Simplified Email template content
const emailTemplateContent = `
<!DOCTYPE html>
<html>
<body>
    <h2>Answer Sheet Delivery Test</h2>
    <p>Dear Student ({{studentId}}),</p>
    <p>This is a test email for checking answer sheet distribution.
      Please ignore mail.</p>
    <br>
    <p>Best regards,<br>Admin Team</p>
</body>
</html>`;

const errorTemplateContent = `
<!DOCTYPE html>
<html>
<body>
    <h2>Error Processing Answer Sheet</h2>
    <p>An error occurred while processing answer sheet for student {{studentId}}.</p>
    <p>Error: {{error}}</p>
    <p>Timestamp: {{timestamp}}</p>
</body>
</html>`;

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Create rate limiter
const limiter = new Bottleneck({
  minTime: 1000, // Minimum time between emails (1 second)
  maxConcurrent: 1 // Limit to one concurrent email operation
});

// Email configuration
const emailConfig = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

// Create email transporter
const transporter = nodemailer.createTransport(emailConfig);

// Function to convert BITS ID to email
function getEmailFromId(fileId) {
  try {
    // Regex to match the pattern: year + 4 alphanumeric characters + ID + G
    const match = fileId.match(/(\d{4})([A-Z0-9]{4})(\d{4})G/);
    if (!match) throw new Error('Invalid ID format');
    
    const [, year, , id] = match;
    return `f${year}${id}@goa.bits-pilani.ac.in`;
  } catch (error) {
    throw new Error(`Invalid file ID format: ${fileId}`);
  }
}

// Initialize templates and compile them
let templates = null;

// Function to ensure directories and templates exist
async function ensureDirectoriesAndTemplates() {
  // Create directories if they don't exist
  const directories = ['logs', 'templates', 'answer-sheets'];
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  });

  // Create template files if they don't exist
  const templateFiles = {
    'email.html': emailTemplateContent,
    'error-notification.html': errorTemplateContent
  };

  for (const [filename, content] of Object.entries(templateFiles)) {
    const filepath = path.join('templates', filename);
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, content);
      logger.info(`Created template file: ${filename}`);
    }
  }

  // Load and compile templates
  const emailTemplates = {
    success: fs.readFileSync(path.join('templates', 'email.html'), 'utf-8'),
    error: fs.readFileSync(path.join('templates', 'error-notification.html'), 'utf-8')
  };

  templates = {
    success: handlebars.compile(emailTemplates.success),
    error: handlebars.compile(emailTemplates.error)
  };
}

// Function to send email
async function sendEmail(toEmail, pdfPath, studentId) {
  const emailContent = {
    from: emailConfig.auth.user,
    to: toEmail,
    subject: 'Your Answer Sheet',
    html: templates.success({
      studentId: studentId,
      supportEmail: emailConfig.auth.user
    }),
    attachments: [{
      filename: path.basename(pdfPath),
      path: pdfPath
    }]
  };

  return limiter.schedule(() => transporter.sendMail(emailContent));
}

// Function to send error notification
async function sendErrorNotification(error, studentId) {
  const adminEmail = emailConfig.auth.user;
  const emailContent = {
    from: adminEmail,
    to: adminEmail,
    subject: `Error Processing Answer Sheet - ${studentId}`,
    html: templates.error({
      studentId: studentId,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  };

  return limiter.schedule(() => transporter.sendMail(emailContent));
}

// Process PDFs in the answer-sheets directory
async function processPDFs() {
  const startTime = Date.now();
  logger.info(`Starting to process PDFs in answer-sheets directory`);

  try {
    // Read directory contents
    const files = await fs.promises.readdir('./answer-sheets');
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));

    // If no PDFs found, log and exit
    if (pdfFiles.length === 0) {
      logger.warn('No PDF files found in answer-sheets directory');
      return [];
    }

    // Process results for all PDFs
    const results = [];

    for (const file of pdfFiles) {
      const startFileTime = Date.now();
      const filePath = path.join('./answer-sheets', file);
      const studentId = path.basename(file, '.pdf');

      try {
        // Get student email
        const toEmail = getEmailFromId(studentId);
        
        // Send email
        await sendEmail(toEmail, filePath, studentId);
        
        const processingTime = (Date.now() - startFileTime) / 1000;
        logger.info(`Successfully processed ${studentId} in ${processingTime.toFixed(2)}s`);
        
        results.push({ 
          success: true, 
          id: studentId,
          email: toEmail,
          processingTime 
        });
      } catch (error) {
        const processingTime = (Date.now() - startFileTime) / 1000;
        logger.error(`Error processing ${studentId} after ${processingTime.toFixed(2)}s:`, error);
        await sendErrorNotification(error, studentId);
        
        results.push({ 
          success: false, 
          id: studentId, 
          error: error.message,
          processingTime 
        });
      }
    }

    // Log overall processing summary
    const totalTime = (Date.now() - startTime) / 1000;
    logger.info(`Processed ${pdfFiles.length} PDFs in ${totalTime.toFixed(2)}s`);

    return results;
  } catch (error) {
    logger.error('Fatal error processing PDFs:', error);
    throw error;
  }
}

// Main function to initialize and process PDFs
async function main() {
  try {
    // Ensure directories and templates are set up
    await ensureDirectoriesAndTemplates();
    
    logger.info('Initialization completed successfully');
    logger.info('Processing PDFs in answer-sheets directory');
    
    // Process PDFs
    const results = await processPDFs();
    
    // Print results summary
    console.log('Processing Results:');
    console.log(`Total PDFs processed: ${results.length}`);
    console.log('Successful:');
    results.filter(r => r.success).forEach(r => 
      console.log(`- ${r.id}: sent to ${r.email} (${r.processingTime}s)`)
    );
    console.log('Failed:');
    results.filter(r => !r.success).forEach(r => 
      console.log(`- ${r.id}: ${r.error}`)
    );
    
    return results;
  } catch (error) {
    logger.error('Script failed:', error);
    console.error('Failed to process PDFs:', error.message);
    process.exit(1);
  }
}

// Export functions for potential testing or module import
module.exports = {
  processPDFs,
  main
};

// Run if called directly
if (require.main === module) {
  main();
}