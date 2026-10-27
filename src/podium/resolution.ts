// Resize HDR/TAA targets only after sustained pressure, with room to settle between reallocations.
export class ResolutionGovernor {
  private direction = 0;
  private samples = 0;
  private until = 0;
  reset(now: number) { this.direction = this.samples = 0; this.until = now + 3000; }
  sample(scale: number, desired: number, now: number, interacting: boolean, min: number, max: number) {
    const direction = desired < scale * 0.90 ? -1 : desired > scale * 1.16 ? 1 : 0;
    if (!direction || interacting || now < this.until) { this.direction = this.samples = 0; return scale; }
    if (direction !== this.direction) { this.direction = direction; this.samples = 0; }
    if (++this.samples < (direction < 0 ? 3 : 8)) return scale;
    this.samples = 0; this.until = now + (direction < 0 ? 3500 : 8000);
    const next = direction < 0 ? Math.max(desired, scale * 0.8) : Math.min(desired, scale * 1.1);
    return Math.max(min, Math.min(max, Math.round(next * 20) / 20));
  }
}
