import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// Snapshots a DOM element (the current report's table/cards, not the whole page — caller
// passes the specific container) into a PDF. Renders to a tall canvas first since
// html2canvas captures the full scrollHeight, then slices it across as many A4 pages as
// needed — long tables just continue onto page 2, 3, etc. instead of getting cut off.
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth  = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidth  = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  // Slice the full-height canvas into page-sized chunks by drawing it onto a per-page
  // canvas at a shifted Y offset — jsPDF has no native "continue image across pages".
  const pxPerPage = (pageHeight / imgHeight) * canvas.height
  let renderedPx = 0
  let pageIndex = 0

  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pxPerPage, canvas.height - renderedPx)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeightPx
    const ctx = pageCanvas.getContext('2d')!
    ctx.drawImage(canvas, 0, -renderedPx)

    const sliceImgHeight = (sliceHeightPx * imgWidth) / canvas.width
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, sliceImgHeight)

    renderedPx += sliceHeightPx
    pageIndex++
  }

  pdf.save(`${filename}.pdf`)
}
