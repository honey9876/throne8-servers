// src/utils/pdfGenerator.ts

import { logger } from "../../shared/logger.util";

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate?: Date;
  customerName: string;
  customerEmail: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  notes?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ReportData {
  title: string;
  generatedDate: Date;
  sections: ReportSection[];
  summary?: Record<string, any>;
}

interface ReportSection {
  title: string;
  content: string | Record<string, any>;
  charts?: any[];
}

interface CertificateData {
  recipientName: string;
  courseName: string;
  completionDate: Date;
  certificateId: string;
  mentorName?: string;
}

class PDFGenerator {
  /**
   * Generate invoice PDF
   */
  async generateInvoice(data: InvoiceData): Promise<Buffer> {
    try {
      logger.info(`Generating invoice PDF: ${data.invoiceNumber}`);

      const html = this.createInvoiceHTML(data);
      
      // In production, use puppeteer or pdfkit to convert HTML to PDF
      // For now, return HTML as buffer
      const pdfBuffer = Buffer.from(html);
      
      return pdfBuffer;
    } catch(error : any) {
      logger.error('Failed to generate invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate report PDF
   */
  async generateReport(data: ReportData): Promise<Buffer> {
    try {
      logger.info(`Generating report PDF: ${data.title}`);

      const html = this.createReportHTML(data);
      const pdfBuffer = Buffer.from(html);
      
      return pdfBuffer;
    } catch(error : any) {
      logger.error('Failed to generate report PDF:', error);
      throw error;
    }
  }

  /**
   * Generate certificate PDF
   */
  async generateCertificate(data: CertificateData): Promise<Buffer> {
    try {
      logger.info(`Generating certificate PDF for: ${data.recipientName}`);

      const html = this.createCertificateHTML(data);
      const pdfBuffer = Buffer.from(html);
      
      return pdfBuffer;
    } catch(error : any) {
      logger.error('Failed to generate certificate PDF:', error);
      throw error;
    }
  }

  /**
   * Create invoice HTML
   */
  private createInvoiceHTML(data: InvoiceData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            color: #333;
          }
          .header { 
            text-align: center; 
            margin-bottom: 40px;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 20px;
          }
          .invoice-details { 
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
          }
          table { 
            width: 100%; 
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #ddd; 
          }
          th {
            background-color: #4CAF50;
            color: white;
          }
          .total-row {
            font-weight: bold;
            font-size: 18px;
            background-color: #f5f5f5;
          }
          .notes {
            margin-top: 30px;
            padding: 15px;
            background-color: #f9f9f9;
            border-left: 4px solid #4CAF50;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>INVOICE</h1>
          <p>Invoice #${data.invoiceNumber}</p>
        </div>
        
        <div class="invoice-details">
          <div>
            <h3>Bill To:</h3>
            <p><strong>${data.customerName}</strong></p>
            <p>${data.customerEmail}</p>
          </div>
          <div>
            <p><strong>Date:</strong> ${new Date(data.date).toLocaleDateString()}</p>
            ${data.dueDate ? `<p><strong>Due Date:</strong> ${new Date(data.dueDate).toLocaleDateString()}</p>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td>${item.quantity}</td>
                <td>${data.currency} ${item.unitPrice.toFixed(2)}</td>
                <td>${data.currency} ${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr>
              <td colspan="3" style="text-align: right;"><strong>Subtotal:</strong></td>
              <td>${data.currency} ${data.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="text-align: right;"><strong>Tax:</strong></td>
              <td>${data.currency} ${data.tax.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3" style="text-align: right;">TOTAL:</td>
              <td>${data.currency} ${data.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        ${data.notes ? `
          <div class="notes">
            <h4>Notes:</h4>
            <p>${data.notes}</p>
          </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  /**
   * Create report HTML
   */
  private createReportHTML(data: ReportData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            color: #333;
          }
          .header { 
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #2196F3;
            padding-bottom: 20px;
          }
          .section { 
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .section-title {
            color: #2196F3;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .summary-box {
            background-color: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #2196F3;
            color: white;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${data.title}</h1>
          <p>Generated on: ${new Date(data.generatedDate).toLocaleString()}</p>
        </div>

        ${data.summary ? `
          <div class="summary-box">
            <h3>Summary</h3>
            ${Object.entries(data.summary).map(([key, value]) => `
              <p><strong>${key}:</strong> ${value}</p>
            `).join('')}
          </div>
        ` : ''}

        ${data.sections.map(section => `
          <div class="section">
            <h2 class="section-title">${section.title}</h2>
            ${typeof section.content === 'string' 
              ? `<p>${section.content}</p>` 
              : `<pre>${JSON.stringify(section.content, null, 2)}</pre>`
            }
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }

  /**
   * Create certificate HTML
   */
  private createCertificateHTML(data: CertificateData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Georgia', serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .certificate {
            width: 800px;
            padding: 60px;
            border: 15px solid #4CAF50;
            text-align: center;
            background: linear-gradient(135deg, #fff 0%, #f9f9f9 100%);
          }
          .title {
            font-size: 48px;
            color: #4CAF50;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 3px;
          }
          .subtitle {
            font-size: 24px;
            color: #666;
            margin-bottom: 40px;
          }
          .recipient {
            font-size: 36px;
            color: #333;
            margin: 30px 0;
            font-weight: bold;
            border-bottom: 2px solid #4CAF50;
            display: inline-block;
            padding-bottom: 10px;
          }
          .completion {
            font-size: 20px;
            color: #666;
            margin: 30px 0;
          }
          .course {
            font-size: 24px;
            color: #4CAF50;
            font-weight: bold;
            margin: 20px 0;
          }
          .signature {
            margin-top: 60px;
            display: flex;
            justify-content: space-around;
          }
          .signature-line {
            width: 200px;
            border-top: 2px solid #333;
            padding-top: 10px;
            font-size: 14px;
            color: #666;
          }
          .certificate-id {
            margin-top: 40px;
            font-size: 12px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="title">Certificate of Completion</div>
          <div class="subtitle">This is to certify that</div>
          <div class="recipient">${data.recipientName}</div>
          <div class="completion">has successfully completed</div>
          <div class="course">${data.courseName}</div>
          <div class="completion">
            on ${new Date(data.completionDate).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
          
          <div class="signature">
            ${data.mentorName ? `
              <div>
                <div class="signature-line">${data.mentorName}</div>
                <div style="font-size: 12px; color: #999;">Mentor</div>
              </div>
            ` : ''}
            <div>
              <div class="signature-line">Platform Director</div>
              <div style="font-size: 12px; color: #999;">Mentorship Platform</div>
            </div>
          </div>

          <div class="certificate-id">
            Certificate ID: ${data.certificateId}
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export default new PDFGenerator();