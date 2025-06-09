# Enhanced File Support for Trade Flashcard Generator

## Supported File Types

The flashcard generator now supports **13 different file types** to accommodate various training materials common in trade professions:

### ✅ **Fully Supported Formats**

#### **Documents**
- **PDF** - Training manuals, safety guides, technical specifications
- **DOCX** - Modern Word documents (2007+)
- **TXT** - Plain text files

#### **Presentations** 
- **PPTX** - Modern PowerPoint presentations (2007+)

#### **Spreadsheets**
- **XLSX** - Modern Excel spreadsheets (2007+) 
- **CSV** - Comma-separated values

#### **Images** (for Image Occlusion)
- **JPEG/JPG** - Electrical diagrams, tool photos
- **PNG** - Schematics, safety signs
- **GIF** - Animated procedures
- **WebP** - Modern image format

### ⚠️ **Legacy Format Support**

These older formats are supported but with limitations:
- **DOC** - Legacy Word documents (requires conversion message)
- **PPT** - Legacy PowerPoint (requires conversion message) 
- **XLS** - Legacy Excel (requires conversion message)

**Recommendation:** Convert legacy files to modern formats (DOCX, PPTX, XLSX) for best results.

## File Size Limits

- **Most files:** 10MB maximum
- **Presentations:** 15MB maximum (larger due to embedded media)

## Processing Libraries Used

The implementation uses these browser-based libraries:

1. **mammoth.js** - DOCX text extraction
2. **JSZip** - PPTX content extraction  
3. **SheetJS (XLSX)** - Excel file processing
4. **PDF.js** - PDF text extraction (existing)

## Use Cases by Trade

### **Electricians**
- Code manuals (PDF)
- Safety procedures (DOCX)
- Wiring diagrams (Images)
- Training presentations (PPTX)

### **Plumbers** 
- Installation guides (PDF)
- Pipe sizing charts (XLSX)
- System schematics (Images)

### **HVAC Technicians**
- Equipment manuals (PDF)
- Load calculations (XLSX)
- System diagrams (Images)

### **Welders**
- Safety protocols (DOCX)
- Procedure sheets (PDF)
- Process charts (XLSX)

### **Carpenters**
- Building codes (PDF)
- Material lists (XLSX)
- Construction drawings (Images)

## Error Handling

The system provides clear error messages for:
- Unsupported file types
- File size exceeded
- Empty/corrupted files
- Legacy format guidance
- Processing failures

## Performance Features

- **Progressive loading** - Libraries loaded only when needed
- **Smart caching** - Libraries loaded once per session
- **User feedback** - Loading messages during processing
- **Format detection** - Automatic file type recognition

## Future Enhancements

Potential additions:
- **RTF** support
- **ODT** (OpenDocument) support  
- **Advanced image OCR** for scanned documents
- **Audio file** transcription
- **Video subtitle** extraction 