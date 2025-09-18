// Formatting utilities for display

export class FormattingService {
  // Format timestamp for display
  static formatTimestamp(timestamp: Date | string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Format full date for display
  static formatFullDate(timestamp: Date | string): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Truncate text with ellipsis
  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  // Format position as percentage
  static formatPosition(position: { x: number; y: number }): string {
    const xPercent = Math.round(position.x * 100);
    const yPercent = Math.round(position.y * 100);
    return `${xPercent}%, ${yPercent}%`;
  }

  // Generate color from string (for consistent user colors)
  static generateColorFromString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  // Format participant count
  static formatParticipantCount(count: number): string {
    if (count === 0) {
      return 'No participants';
    } else if (count === 1) {
      return '1 participant';
    } else {
      return `${count} participants`;
    }
  }

  // Format rating count
  static formatRatingCount(count: number): string {
    if (count === 0) {
      return 'No ratings';
    } else if (count === 1) {
      return '1 rating';
    } else {
      return `${count} ratings`;
    }
  }

  // Format comment count
  static formatCommentCount(count: number): string {
    if (count === 0) {
      return 'No comments';
    } else if (count === 1) {
      return '1 comment';
    } else {
      return `${count} comments`;
    }
  }

  // Generate activity URL
  static generateActivityUrl(activityId: string): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/activity/${activityId}`;
  }

  // Generate admin URL
  static generateAdminUrl(activityId?: string): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return activityId ? `${baseUrl}/admin?activity=${activityId}` : `${baseUrl}/admin`;
  }

  // Validate and format URL
  static formatUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  // Generate QR code URL for activity
  static generateQRCodeUrl(activityId: string): string {
    const activityUrl = this.generateActivityUrl(activityId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activityUrl)}`;
  }
}