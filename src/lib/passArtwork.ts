export async function drawPassEventDetails(ctx: CanvasRenderingContext2D) {
  let date = '';
  let time = '';
  let venue = '';

  try {
    const response = await fetch('/api/event-settings');
    if (response.ok) {
      const settings = await response.json();
      date = typeof settings?.date_label === 'string' ? settings.date_label.trim() : '';
      time = typeof settings?.time_label === 'string' ? settings.time_label.trim() : '';
      venue = typeof settings?.venue === 'string' ? settings.venue.trim() : '';
    }
  } catch {
    // Keep the pass useful offline by rendering the unset state.
  }

  ctx.save();
  ctx.fillStyle = '#111612';
  ctx.fillRect(408, 498, 1092, 130);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d5ddb9';
  ctx.font = '600 28px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.fillText(`Date: ${date || 'To be announced'}   •   Time: ${time || 'To be announced'}`, 432, 516, 1040);
  ctx.fillStyle = '#bdca91';
  ctx.fillText(`Venue: ${venue || 'To be announced'}`, 432, 568, 1040);
  ctx.restore();
}
