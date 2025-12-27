/**
 * Pattern Marketplace Types (FEAT-005)
 *
 * Community-driven pattern sharing, discovery, and installation.
 * Enables collective learning by allowing users to publish and consume
 * learned patterns from other users.
 */

/**
 * Pattern categories for organization and discovery
 */
export type PatternCategory =
  | 'ecommerce'          // Shopping, products, pricing
  | 'government'         // Gov services, forms, regulations
  | 'news'               // News sites, articles, blogs
  | 'social-media'       // Social platforms, profiles
  | 'documentation'      // API docs, technical documentation
  | 'finance'            // Banking, stocks, crypto
  | 'real-estate'        // Property listings, rentals
  | 'jobs'               // Job boards, career sites
  | 'travel'             // Flights, hotels, bookings
  | 'health'             // Medical, healthcare, wellness
  | 'education'          // Learning platforms, courses
  | 'entertainment'      // Streaming, movies, music
  | 'sports'             // Sports scores, teams, stats
  | 'weather'            // Weather forecasts, data
  | 'other';             // Uncategorized

/**
 * Pattern type classification
 */
export type PatternType =
  | 'api'                // API endpoint pattern
  | 'selector'           // CSS/XPath selector pattern
  | 'workflow'           // Multi-step workflow
  | 'skill'              // Procedural skill
  | 'websocket';         // WebSocket pattern

/**
 * Moderation status for published patterns
 */
export type ModerationStatus =
  | 'pending'            // Awaiting review
  | 'approved'           // Approved for marketplace
  | 'rejected'           // Rejected by moderator
  | 'flagged'            // Flagged by users, needs review
  | 'suspended';         // Temporarily suspended

/**
 * Published pattern in the marketplace
 */
export interface PublishedPattern {
  id: string;

  // Pattern content
  patternType: PatternType;
  patternData: any; // Actual pattern (ApiPattern, SelectorPattern, Workflow, etc.)

  // Metadata
  name: string;
  description: string;
  category: PatternCategory;
  tags: string[];

  // Author information
  authorId: string;
  authorName?: string;

  // Domain/site information
  domain: string;
  targetSite?: string; // Human-readable site name
  exampleUrl?: string; // Example URL where pattern works

  // Versioning
  version: string; // Semantic version (1.0.0, 1.1.0, etc.)
  changelog?: string;
  previousVersionId?: string; // Link to previous version

  // Usage and stats
  installCount: number;
  successRate?: number; // Reported success rate from users
  avgRating?: number; // Average star rating
  ratingCount: number;

  // Moderation
  moderationStatus: ModerationStatus;
  moderatedAt?: number;
  moderatedBy?: string;
  moderationNotes?: string;

  // Timestamps
  publishedAt: number;
  updatedAt: number;

  // Flags
  isFeatured?: boolean; // Featured by moderators
  isOfficial?: boolean; // Published by Unbrowser team
  requiresAuth?: boolean; // Pattern requires authentication
  isPremium?: boolean; // Premium patterns (future: paid patterns)
}

/**
 * Request to publish a pattern
 */
export interface PublishPatternRequest {
  patternType: PatternType;
  patternData: any;
  name: string;
  description: string;
  category: PatternCategory;
  tags: string[];
  domain: string;
  targetSite?: string;
  exampleUrl?: string;
  version?: string; // Default: 1.0.0
  changelog?: string;
  updateExisting?: string; // ID of existing pattern to update
}

/**
 * Request to update a published pattern
 */
export interface UpdatePatternRequest {
  name?: string;
  description?: string;
  category?: PatternCategory;
  tags?: string[];
  targetSite?: string;
  exampleUrl?: string;
  version?: string;
  changelog?: string;
  patternData?: any; // Update pattern content
}

/**
 * Pattern rating and review
 */
export interface PatternRating {
  id: string;
  patternId: string;
  userId: string;
  userName?: string;

  // Rating
  rating: 1 | 2 | 3 | 4 | 5; // Star rating

  // Review (optional)
  review?: string;
  title?: string;

  // Feedback
  helpful: number; // Helpful votes
  notHelpful: number; // Not helpful votes

  // Verification
  verified?: boolean; // User verified they successfully used pattern

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Request to rate a pattern
 */
export interface RatePatternRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  review?: string;
  title?: string;
  verified?: boolean;
}

/**
 * Pattern installation record
 */
export interface PatternInstallation {
  id: string;
  patternId: string;
  userId: string;
  installedAt: number;

  // Usage tracking
  usageCount: number;
  lastUsedAt?: number;
  successCount: number;
  failureCount: number;

  // User notes
  notes?: string;

  // Version tracking
  installedVersion: string;
  autoUpdate: boolean; // Auto-update to new versions
}

/**
 * Pattern search filters
 */
export interface PatternSearchFilters {
  // Text search
  query?: string; // Search in name, description, tags

  // Filters
  category?: PatternCategory;
  patternType?: PatternType;
  tags?: string[];
  domain?: string;
  authorId?: string;

  // Quality filters
  minRating?: number; // Minimum average rating
  minInstalls?: number; // Minimum install count
  verified?: boolean; // Only verified patterns
  featured?: boolean; // Only featured patterns
  official?: boolean; // Only official patterns

  // Sorting
  sortBy?: 'relevance' | 'rating' | 'installs' | 'newest' | 'updated';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  page?: number;
  limit?: number;
}

/**
 * Pattern search result
 */
export interface PatternSearchResult {
  patterns: PublishedPattern[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Pattern report (user-flagged content)
 */
export interface PatternReport {
  id: string;
  patternId: string;
  reportedBy: string;
  reason: 'spam' | 'broken' | 'inappropriate' | 'duplicate' | 'malicious' | 'other';
  details?: string;
  reportedAt: number;

  // Moderation
  status: 'pending' | 'reviewed' | 'dismissed' | 'action-taken';
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;
}

/**
 * Pattern statistics (for authors)
 */
export interface PatternStats {
  patternId: string;

  // Install stats
  totalInstalls: number;
  installsLast7Days: number;
  installsLast30Days: number;

  // Usage stats
  totalUsage: number;
  successfulUsage: number;
  failedUsage: number;
  successRate: number;

  // Rating stats
  avgRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };

  // Engagement
  totalReviews: number;
  totalReports: number;

  // Timeline
  installsByDay: Array<{ date: string; count: number }>;
  usageByDay: Array<{ date: string; count: number }>;
}

/**
 * Marketplace analytics (for admins)
 */
export interface MarketplaceAnalytics {
  // Pattern stats
  totalPatterns: number;
  patternsByCategory: Record<PatternCategory, number>;
  patternsByType: Record<PatternType, number>;
  pendingModeration: number;

  // User engagement
  totalAuthors: number;
  totalInstalls: number;
  totalRatings: number;
  avgRating: number;

  // Growth
  newPatternsLast7Days: number;
  newPatternsLast30Days: number;
  newAuthorsLast7Days: number;
  newAuthorsLast30Days: number;

  // Quality
  featuredPatterns: number;
  officialPatterns: number;
  topPatterns: PublishedPattern[]; // Top 10 by installs
  topAuthors: Array<{ authorId: string; authorName?: string; patternCount: number }>;
}

/**
 * Collection of patterns (future: user-curated collections)
 */
export interface PatternCollection {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName?: string;

  // Patterns
  patternIds: string[];

  // Metadata
  category?: PatternCategory;
  tags: string[];
  isPublic: boolean;

  // Stats
  followCount: number;
  installCount: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}
