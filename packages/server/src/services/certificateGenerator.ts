import PDFDocument from 'pdfkit';

export interface CertificateParams {
  userName: string;
  certificationName: string;
  score: number;
  date: Date;
  certificateId: string;
}

/**
 * Generates a PDF certificate for a passed exam.
 * Returns a Buffer containing the PDF data.
 */
export async function generateCertificatePdf(params: CertificateParams): Promise<Buffer> {
  const { userName, certificationName, score, date, certificateId } = params;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Background gradient effect - light cream/gold tones
      doc.rect(0, 0, pageWidth, pageHeight).fill('#fdf8e8');

      // Decorative border
      const borderMargin = 30;
      doc
        .rect(
          borderMargin,
          borderMargin,
          pageWidth - borderMargin * 2,
          pageHeight - borderMargin * 2
        )
        .lineWidth(2)
        .stroke('#c9a227');

      // Inner decorative line
      const innerMargin = 40;
      doc
        .rect(innerMargin, innerMargin, pageWidth - innerMargin * 2, pageHeight - innerMargin * 2)
        .lineWidth(0.5)
        .stroke('#d4af37');

      // Header - ACE Prep branding
      doc
        .fillColor('#1a365d')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('ACE PREP', 0, 60, { align: 'center' });

      doc
        .fillColor('#4a5568')
        .fontSize(10)
        .font('Helvetica')
        .text('Certification Exam Preparation Platform', 0, 82, { align: 'center' });

      // Certificate title
      doc
        .fillColor('#c9a227')
        .fontSize(36)
        .font('Helvetica-Bold')
        .text('Certificate of Achievement', 0, 120, { align: 'center' });

      // Decorative line under title
      const lineY = 170;
      const lineWidth = 300;
      const lineX = (pageWidth - lineWidth) / 2;
      doc
        .moveTo(lineX, lineY)
        .lineTo(lineX + lineWidth, lineY)
        .lineWidth(1)
        .stroke('#c9a227');

      // "This certifies that" text
      doc
        .fillColor('#4a5568')
        .fontSize(14)
        .font('Helvetica')
        .text('This certifies that', 0, 195, { align: 'center' });

      // Recipient name
      doc
        .fillColor('#1a365d')
        .fontSize(32)
        .font('Helvetica-Bold')
        .text(userName, 0, 225, { align: 'center' });

      // "has successfully completed" text
      doc
        .fillColor('#4a5568')
        .fontSize(14)
        .font('Helvetica')
        .text('has successfully completed a practice exam for', 0, 275, { align: 'center' });

      // Certification name
      doc
        .fillColor('#1a365d')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(certificationName, 0, 305, { align: 'center' });

      // Score achievement
      doc
        .fillColor('#4a5568')
        .fontSize(14)
        .font('Helvetica')
        .text(`with a score of ${score}%`, 0, 345, { align: 'center' });

      // Date
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      doc
        .fillColor('#4a5568')
        .fontSize(12)
        .font('Helvetica')
        .text(`Issued on ${formattedDate}`, 0, 380, { align: 'center' });

      // Certificate ID (for verification)
      doc
        .fillColor('#718096')
        .fontSize(10)
        .font('Helvetica')
        .text(`Certificate ID: ${certificateId}`, 0, 430, { align: 'center' });

      // Verification note
      doc
        .fillColor('#a0aec0')
        .fontSize(8)
        .font('Helvetica')
        .text('Verify this certificate at: aceprep.app/verify', 0, 450, { align: 'center' });

      // Footer disclaimer
      doc
        .fillColor('#a0aec0')
        .fontSize(7)
        .font('Helvetica')
        .text(
          'This certificate recognizes completion of practice exam preparation and does not represent official certification.',
          0,
          pageHeight - 55,
          { align: 'center' }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
