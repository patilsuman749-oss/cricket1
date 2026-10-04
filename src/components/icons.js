const paths={
 home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 play:'<path d="m8 5 11 7-11 7z"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c.6-3 2.6-5 6-5s5.4 2 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 15c2.2.8 3.3 2.3 3.7 5"/>',
 chart:'<path d="M4 19V5"/><path d="M4 19h17"/><path d="m7 15 3-4 3 2 5-7"/>',
 settings:'<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9 1.8 1.8 0 0 1-3.6 0 1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3 1.8 1.8 0 0 1 0-3.6 1.8 1.8 0 0 0 .9-3l-.1-.1A1.8 1.8 0 0 1 8.2 3l.1.1a1.8 1.8 0 0 0 3-.9 1.8 1.8 0 0 1 3.6 0 1.8 1.8 0 0 0 3 .9l.1-.1A1.8 1.8 0 0 1 20.5 5l-.1.1a1.8 1.8 0 0 0 .9 3 1.8 1.8 0 0 1 0 3.6 1.8 1.8 0 0 0-.9 3Z"/>',
 moon:'<path d="M21 13a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 21 13z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
 back:'<path d="m15 18-6-6 6-6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 share:'<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V4M7 9l5-5 5 5"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 refresh:'<path d="M20 11a8 8 0 1 0 1 4"/><path d="M20 4v7h-7"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 9-12h-7z"/>'
};
export function icon(name,size=20){ return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.more}</svg>`; }
