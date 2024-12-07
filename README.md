# Answer Sheet Distributor

## Project Setup

### 1. Clone the Project
```bash
git clone https://github.com/Swapnil-DevGeek/answer-sheet-distributor.git
cd answer-sheet-distributor
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Prepare Project Directories and Configuration
### Create Answer Sheets Folder
Create a folder named answer-sheets in the project root directory and add scanned PDFs named according to student ID.

Example:
```
answer-sheets/
├── 2022A7PS0181G.pdf
├── 2022A7PS1274G.pdf
└── 2022B3A70181G.pdf
```

### Configure Environment Variables
Create a .env file in the project root with the following details:
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

Generating App Password

1. Turn on 2-Step Verification for your Gmail account
2. Generate an App Password:<br/>
  a. Visit: [here](https://fasturl.in/UvIRrL) ,write app name and click on Create. <br/>
  b. Copy the generated 16-character password. <br/>
  c. Paste this password in the .env file for EMAIL_PASS. <br/>

### 4. Run the Project
``` bash
npm run dev
```

### Important Notes
  - Ensure all PDFs in the answer-sheets folder are named exactly according to the student ID
  - Keep the .env file private and do not commit it to version control
  - Make sure you have Node.js installed before running the project
