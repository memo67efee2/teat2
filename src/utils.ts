export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const blendColorsInt = (
  color1: number,
  color2: number,
  percentage: number,
) => {
  // Ensure the percentage is between 0 and 100
  percentage = Math.min(100, Math.max(0, percentage));

  // Extract RGB components from integer color values
  const extractRGB = (color: number) => {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return { r, g, b };
  };

  // Combine RGB components back into an integer color
  const combineRGB = (r: number, g: number, b: number) => {
    return (r << 16) | (g << 8) | b;
  };

  // Blend the RGB values
  const blend = (c1: number, c2: number, p: number) => {
    return Math.round(c1 + (c2 - c1) * (p / 100));
  };

  // Extract RGB values from the two input colors
  const rgb1 = extractRGB(color1);
  const rgb2 = extractRGB(color2);

  // Blend each RGB component individually
  const r = blend(rgb1.r, rgb2.r, percentage);
  const g = blend(rgb1.g, rgb2.g, percentage);
  const b = blend(rgb1.b, rgb2.b, percentage);

  // Combine the blended RGB components back into an integer
  return combineRGB(r, g, b);
};
