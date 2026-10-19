import { PDFDocument, StandardFonts } from "pdf-lib";
import { IResume } from "../models/resume.model";

export const generateResumePdf = async (
  resume: IResume
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();

  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();

  let y = height - 50;

  page.drawText(resume.personalInfo.fullName, {
    x: 50,
    y,
    size: 22,
    font,
  });

  y -= 30;

  page.drawText(resume.personalInfo.title, {
    x: 50,
    y,
    size: 14,
    font,
  });

  y -= 40;

  page.drawText(`Email: ${resume.personalInfo.email}`, {
    x: 50,
    y,
    size: 12,
    font,
  });

  y -= 30;

  page.drawText("Summary", {
    x: 50,
    y,
    size: 16,
    font,
  });

  y -= 20;

  page.drawText(resume.summary || "", {
    x: 50,
    y,
    size: 12,
    maxWidth: width - 100,
    font,
  });

  return await pdfDoc.save();
};