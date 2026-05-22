import PDFDocument from "pdfkit";

export async function generatePremiumPdf(
  profileName: string,
  markdownContent: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Title Page
      doc
        .font("Helvetica-Bold")
        .fontSize(28)
        .fillColor("#D4A04A")
        .text("AstroWeb Premium Report", { align: "center" })
        .moveDown();

      doc
        .fontSize(20)
        .fillColor("#333333")
        .text(`Prepared for: ${profileName}`, { align: "center" })
        .moveDown(3);

      doc
        .fontSize(12)
        .fillColor("#666666")
        .text("Your cosmic blueprint and deeper psychological analysis.", { align: "center" });

      doc.addPage();

      // Basic markdown parsing for the PDF
      // A full implementation would use a markdown-to-pdf library or parse tokens.
      // Here we simulate parsing by splitting by newlines and looking for headers.
      doc.fillColor("#000000");
      const lines = markdownContent.split("\n");

      for (const line of lines) {
        if (line.startsWith("### ")) {
          doc.moveDown().font("Helvetica-Bold").fontSize(14).text(line.replace("### ", ""));
        } else if (line.startsWith("## ")) {
          doc.moveDown(1.5).font("Helvetica-Bold").fontSize(18).fillColor("#D4A04A").text(line.replace("## ", "")).fillColor("#000000");
        } else if (line.startsWith("# ")) {
          doc.addPage().font("Helvetica-Bold").fontSize(22).fillColor("#D4A04A").text(line.replace("# ", "")).fillColor("#000000");
        } else if (line.trim() !== "") {
          doc.font("Helvetica").fontSize(11).text(line, { align: "justify" }).moveDown(0.5);
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
