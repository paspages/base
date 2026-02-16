import { Context } from 'hono';
import { Registry } from './registry';

export class ViewEngine {
  static render(c: Context, viewName: string, data: Record<string, string | number> = {}) {
    let template = Registry.getView(viewName);
    if (!template) return c.html(`<h1>Error: View '${viewName}' not found in '${Registry.getActiveThemeName()}'</h1>`, 500);

    const finalData = { ...data, theme_name: Registry.getActiveThemeName(), year: new Date().getFullYear() };
    
    Object.keys(finalData).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        template = template!.replace(regex, String(finalData[key]));
    });
    return c.html(template);
  }
}
