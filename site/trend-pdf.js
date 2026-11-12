(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrendPdf = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function asciiBytes(value) {
    return new TextEncoder().encode(value);
  }

  function base64Bytes(dataUrl) {
    const base64 = String(dataUrl).split(",")[1] || "";
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
    const binary = atob(base64);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function buildPdfFromJpeg(dataUrl, imageWidth, imageHeight) {
    const jpeg = base64Bytes(dataUrl);
    if (!jpeg.length || !imageWidth || !imageHeight) throw new Error("The chart image could not be converted to PDF.");
    const pageWidth = 841.89;
    const pageHeight = 595.28;
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const push = value => {
      const bytes = typeof value === "string" ? asciiBytes(value) : value;
      chunks.push(bytes);
      length += bytes.length;
    };
    const object = (number, body) => {
      offsets[number] = length;
      push(`${number} 0 obj\n${body}\nendobj\n`);
    };
    push("%PDF-1.4\n%PDFCHART\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Chart 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = length;
    push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream\nendobj\n");
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Chart Do\nQ\n`;
    object(5, `<< /Length ${asciiBytes(content).length} >>\nstream\n${content}endstream`);
    const xrefOffset = length;
    push("xref\n0 6\n0000000000 65535 f \n");
    for (let number = 1; number <= 5; number += 1) push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  return { buildPdfFromJpeg };
});
