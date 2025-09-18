export function getAdminUrl(path: string = '/admin'): string {
  if (typeof window === 'undefined') {
    return path;
  }
  
  const adminSubdomain = process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN || 'admin';
  const currentHostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // For localhost development
  if (currentHostname === 'localhost' || currentHostname.includes('localhost')) {
    const adminHost = `admin.localhost${port ? `:${port}` : ''}`;
    return `${protocol}//${adminHost}${path}`;
  }
  
  // For production - we-all-explain deploys to root domain
  const hostParts = currentHostname.split('.');
  if (hostParts.length >= 2) {
    const domain = hostParts.slice(-2).join('.');
    const adminHost = `${adminSubdomain}.${domain}`;
    return `${protocol}//${adminHost}${path}`;
  }
  
  return path;
}

export function isAdminDomain(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const adminSubdomain = process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN || 'admin';
  const hostname = window.location.hostname;
  
  // For localhost development
  if (hostname === 'admin.localhost') {
    return true;
  }
  
  // For production
  const subdomain = hostname.split('.')[0];
  return subdomain === adminSubdomain;
}

export function getMainAppUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  
  const currentHostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // For localhost development - remove "admin." subdomain
  if (currentHostname === 'admin.localhost') {
    const mainHost = `localhost${port ? `:${port}` : ''}`;
    return `${protocol}//${mainHost}${path}`;
  }
  
  // For production - replace admin subdomain with root domain
  const hostParts = currentHostname.split('.');
  if (hostParts.length >= 2 && hostParts[0] === (process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN || 'admin')) {
    const domain = hostParts.slice(1).join('.');
    return `${protocol}//${domain}${path}`;
  }
  
  // If not on admin domain, return relative path
  return path;
}