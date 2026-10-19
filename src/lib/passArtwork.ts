function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseFontSize: number,
  minFontSize = 18
): number {
  let size = baseFontSize;
  while (size > minFontSize) {
    ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 1;
  }
  return minFontSize;
}

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

  const dateText = date || '24 OCT 2026';
  const venueText = venue || 'MAIN AUDITORIUM';
  const timeText = time || '10:00 AM';

  ctx.save();
  ctx.fillStyle = '#231e19';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // DATE box (center: 291, 760, maxWidth: 340)
  const dateSize = fitText(ctx, dateText, 340, 28);
  ctx.font = `700 ${dateSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(dateText, 291, 760);

  // VENUE box (center: 782, 760, maxWidth: 380)
  const venueSize = fitText(ctx, venueText, 380, 28);
  ctx.font = `700 ${venueSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(venueText, 782, 760);

  // TIME box (center: 1251, 760, maxWidth: 300)
  const timeSize = fitText(ctx, timeText, 300, 28);
  ctx.font = `700 ${timeSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(timeText, 1251, 760);

  ctx.restore();
}

export interface PassParticipant {
  id?: number | string;
  full_name?: string;
  roll_number?: string;
}

export function drawPassParticipantDetails(
  ctx: CanvasRenderingContext2D,
  participant: PassParticipant
) {
  const fullName = String(participant.full_name || '').trim().toUpperCase();
  const rollNumber = String(participant.roll_number || '').trim();

  const parts: string[] = [];
  if (fullName) parts.push(`NAME: ${fullName}`);
  if (rollNumber) parts.push(`ROLL: ${rollNumber}`);
  const holderText = parts.join('   •   ');

  if (holderText) {
    ctx.save();
    ctx.fillStyle = '#ebcd87';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fontSize = fitText(ctx, holderText, 1000, 28, 20);
    ctx.font = `700 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(holderText, 770, 626);
    ctx.restore();
  }

  if (participant.id != null) {
    const passId = `PASS #${String(participant.id).padStart(4, '0')}`;
    ctx.save();
    ctx.fillStyle = '#d2b97d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 20px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(passId, 1775, 836);
    ctx.restore();
  }
}
