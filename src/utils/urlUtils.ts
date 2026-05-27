/**
 * Utility functions for URL handling and activity name cleaning
 */

export class UrlUtils {
  /**
   * Clean an activity name to be URL-friendly
   * @param name - The activity name to clean
   * @returns URL-friendly string
   */
  static cleanActivityName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Validate if an activity name is valid for URL use
   * @param name - The activity name to validate
   * @returns boolean indicating if name is valid
   */
  static isValidActivityName(name: string): boolean {
    if (!name || name.trim().length === 0) {
      return false;
    }
    
    const cleaned = this.cleanActivityName(name);
    return cleaned.length > 0 && cleaned.length <= 50;
  }

  /**
   * Check if a cleaned activity name conflicts with existing routes
   * @param cleanedName - The cleaned activity name
   * @returns boolean indicating if there's a conflict
   */
  static hasRouteConflict(cleanedName: string): boolean {
    const reservedRoutes = [
      'admin',
      'api',
      'activity',
      'home',
      'about',
      'contact',
      'help',
      'privacy',
      'terms',
      'support',
      'login',
      'logout',
      'register',
      'dashboard',
      'profile',
      'settings',
      'public',
      'static',
      '_next',
      'favicon.ico'
    ];
    
    return reservedRoutes.includes(cleanedName);
  }

  /**
   * Generate a unique activity URL name
   * @param title - The activity title
   * @param existingNames - Array of existing activity URL names
   * @returns unique URL-friendly name
   */
  static generateUniqueActivityName(title: string, existingNames: string[]): string {
    let baseName = this.cleanActivityName(title);
    
    // If empty or conflicts with routes, use fallback
    if (!baseName || this.hasRouteConflict(baseName)) {
      baseName = 'activity';
    }
    
    let uniqueName = baseName;
    let counter = 1;
    
    while (existingNames.includes(uniqueName)) {
      uniqueName = `${baseName}-${counter}`;
      counter++;
    }
    
    return uniqueName;
  }
}