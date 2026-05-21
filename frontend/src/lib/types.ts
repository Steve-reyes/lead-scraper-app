// Mirrors backend types for the frontend

export interface LeadSource {
  type: 'google_maps' | 'yelp' | 'yellowpages' | 'yell' | 'website_scrape' | 'directory';
  name: string;
  url?: string;
}

export type EnrichmentStatus = 'pending' | 'scanning_website' | 'scanning_directories' | 'complete' | 'failed';

export interface SocialLinks {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
}

export interface Lead {
  id: string;
  businessName: string;
  industry?: string;
  address?: string;
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

// WebSocket message types
export interface WSLeadFound {
  type: 'lead_found';
  payload: {
    lead: Lead;
    totalFound: number;
  };
}

export interface WSLeadEnriched {
  type: 'lead_enriched';
  payload: {
    lead: Lead;
    enrichedWithEmail: number;
    phonesFound: number;
    fallbackSitesScraped: number;
  };
}

export interface WSProgress {
  type: 'progress';
  payload: {
    message: string;
    totalFound?: number;
  };
}

export interface WSComplete {
  type: 'complete';
  payload: {
    totalFound: number;
    enrichedWithEmail: number;
    phonesFound: number;
    fallbackSitesScraped: number;
    message: string;
  };
}

export interface WSEnrichComplete {
  type: 'enrich_complete';
  payload: {
    totalEnriched: number;
    message: string;
  };
}

export interface WSError {
  type: 'error';
  payload: {
    error: string;
  };
}

export interface WSConnected {
  type: 'connected';
  payload: {
    clientId: string;
    message: string;
  };
}

export interface WSRegistered {
  type: 'registered';
  payload: {
    clientId: string;
    message: string;
  };
}

export type WSMessage = WSLeadFound | WSLeadEnriched | WSProgress | WSComplete | WSEnrichComplete | WSError | WSConnected | WSRegistered;

export interface Metrics {
  totalFound: number;
  enrichedWithEmail: number;
  phonesFound: number;
  fallbackSitesScraped: number;
}
