// ===== Core Lead Types =====

export interface LeadSource {
  type: 'google_maps' | 'yelp' | 'yellowpages' | 'yellowpages_ca' | 'canada411' | 'yell' | 'website_scrape' | 'directory' | 'flare_bypass';
  name: string;
  url?: string;
}

export type EnrichmentStatus = 'pending' | 'scanning_website' | 'scanning_directories' | 'complete' | 'failed';

export interface Lead {
  id: string;
  businessName: string;
  normalizedName: string;
  industry?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googlePlaceId?: string;
  socialLinks: SocialLinks;
  sources: LeadSource[];
  enrichmentStatus: EnrichmentStatus;
  enrichmentError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialLinks {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
}

// ===== Search Types =====

export interface SearchRequest {
  keyword: string;
  location: string;
  country: string;
  radiusKm?: number;
  maxResults?: number;
}

export interface SearchProgress {
  type: 'progress' | 'lead_found' | 'lead_enriched' | 'lead_failed' | 'complete' | 'error';
  payload: {
    totalFound?: number;
    enrichedWithEmail?: number;
    phonesFound?: number;
    fallbackSitesScraped?: number;
    lead?: Lead;
    message?: string;
    error?: string;
  };
}

// ===== Directory Result Types =====

export interface DirectoryResult {
  businessName: string;
  phone?: string;
  website?: string;
  email?: string;
  address?: string;
  source: LeadSource;
  rating?: number;
}

// ===== Scraped Contact Types =====

export interface ScrapedContact {
  emails: string[];
  socials: SocialLinks;
  phones: string[];
}

// ===== Dedup Key =====

export interface DedupKey {
  normalizedName: string;
  postalCode: string;
}
