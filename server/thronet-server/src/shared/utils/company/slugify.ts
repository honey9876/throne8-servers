import slugifyLib from 'slugify';

export const slugify = (text: string, separator: string = '-'): string => {
  return slugifyLib(text, {
    lower: true,
    strict: true,
    trim: true,
    replacement: separator,
  });
};

export const generateSlug = (text: string, id?: string): string => {
  const slug = slugify(text);
  return id ? `${slug}-${id}` : slug;
};

export default slugify;