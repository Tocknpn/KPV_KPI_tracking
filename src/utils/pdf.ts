import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// Report tables (Daily Tracking, Reps Performance, etc) sit inside their own
// `overflow-x-auto` div for on-screen horizontal scrolling. html2canvas only rasterizes
// each element's visible/clipped box, not its scrollable content — left un-touched, any
// wide table gets its right-hand columns silently cut off in the exported PDF. Temporarily
// widen every such container to its full scrollWidth before the snapshot, restore after.
function unclipScrollContainers(root: HTMLElement): () => void {
  const containers = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    .filter(el => getComputedStyle(el).overflowX === 'auto' || getComputedStyle(el).overflowX === 'scroll')
  const restore = containers.map(el => {
    const prevOverflow = el.style.overflow
    const prevWidth    = el.style.width
    el.style.overflow = 'visible'
    el.style.width    = `${el.scrollWidth}px`
    return () => { el.style.overflow = prevOverflow; el.style.width = prevWidth }
  })
  return () => restore.forEach(fn => fn())
}

// Snapshots a DOM element (the current report's table/cards, not the whole page — caller
// passes the specific container) into a PDF. Renders to a tall canvas first since
// html2canvas captures the full scrollHeight, then slices it across as many A4 pages as
// needed — long tables just continue onto page 2, 3, etc. instead of getting cut off.
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  // Custom/icon fonts (Material Symbols, Roboto) not yet rasterized at capture time fall
  // back to a generic system font mid-render — the "weird font" look. Wait for them first.
  await document.fonts.ready

  const restoreScroll = unclipScrollContainers(element)
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    })
  } finally {
    restoreScroll()
  }

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
    // JPEG instead of PNG: this report is full of soft gradients/blur (GlassCard
    // backdrop-filter), which PNG's lossless encoding handles very poorly size-wise —
    // a multi-page capture was coming out 70MB+. JPEG at 0.85 quality is visually
    // indistinguishable here and shrinks the file by roughly 10-20x.
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, imgWidth, sliceImgHeight)

    renderedPx += sliceHeightPx
    pageIndex++
  }

  pdf.save(`${filename}.pdf`)
}
