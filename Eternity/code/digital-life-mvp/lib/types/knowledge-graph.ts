// ====================================
// 知识图谱核心类型定义
// ====================================

export interface Person {
  id: string;
  project_id: string;
  name: string;
  aliases: string[];
  role?: string;
  avatar_url?: string;
  cover_photos: string[];
  bio_snippet?: string;
  importance_score: number;
  created_from?: string;
  relationship_to_user?: string;
  extraction_status?: string;
  confidence_score?: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Place {
  id: string;
  project_id: string;
  name: string;
  lat?: number;
  lng?: number;
  place_level?: 'country' | 'city' | 'district' | 'point';
  parent_place_id?: string;
  photos: string[];
  description?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TimeRef {
  id: string;
  project_id: string;
  type: 'exact' | 'range' | 'fuzzy';
  start_date?: string;
  end_date?: string;
  text: string;
  confidence: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Event {
  id: string;
  project_id: string;
  title: string;
  summary?: string;
  time_ref_id?: string;
  tags: string[];
  evidence: Evidence[];
  importance_score: number;
  verified: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  project_id: string;
  person_id?: string;
  event_id?: string;
  place_id?: string;
  time_ref_id?: string;
  snippet?: string;
  quote?: string;
  photos: string[];
  importance_score: number;
  verified: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  text: string;
  source: string;
  location?: string;
  confidence?: number;
}

// ====================================
// 扩展类型（带关联数据）
// ====================================

export interface PersonWithRelations extends Person {
  memories?: Memory[];
  events?: Event[];
  places?: Place[];
  memoryCount?: number;
  earliestDate?: string;
  latestDate?: string;
}

export interface EventWithRelations extends Event {
  people?: Person[];
  places?: Place[];
  timeRef?: TimeRef;
}

export interface PlaceWithRelations extends Place {
  events?: Event[];
  people?: Person[];
  memories?: Memory[];
  childPlaces?: Place[];
  parentPlace?: Place;
}

export interface MemoryWithRelations extends Memory {
  person?: Person;
  event?: Event;
  place?: Place;
  timeRef?: TimeRef;
}

// ====================================
// AI 抽取结果类型
// ====================================

export interface ExtractedPerson {
  name: string;
  aliases: string[];
  role?: string;
  frequency: number;
  evidence: Evidence[];
  confidence: number;
}

export interface ExtractedPlace {
  name: string;
  placeLevel?: string;
  parentPlace?: string;
  frequency: number;
  evidence: Evidence[];
  confidence: number;
}

export interface ExtractedTime {
  type: 'exact' | 'range' | 'fuzzy';
  text: string;
  startDate?: string;
  endDate?: string;
  evidence: Evidence[];
  confidence: number;
}

export interface ExtractedEvent {
  title: string;
  summary: string;
  people: string[];
  places: string[];
  time?: ExtractedTime;
  tags: string[];
  evidence: Evidence[];
  confidence: number;
}

export interface ExtractionResult {
  people: ExtractedPerson[];
  places: ExtractedPlace[];
  times: ExtractedTime[];
  events: ExtractedEvent[];
}

// ====================================
// 筛选和查询参数
// ====================================

export interface TimelineFilters {
  personIds?: string[];
  placeIds?: string[];
  tags?: string[];
  startDate?: string;
  endDate?: string;
  verified?: boolean;
}

export interface PlaceFilters {
  placeLevel?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  hasEvents?: boolean;
}

export interface PeopleFilters {
  roles?: string[];
  minImportance?: number;
  hasAvatar?: boolean;
}

// ====================================
// 人物合并相关类型
// ====================================

export interface MergeLog {
  id: string;
  project_id: string;
  primary_person_id: string;
  secondary_person_id: string;
  merged_by?: string;
  merged_at: string;
  merge_strategy: 'keep_primary' | 'keep_secondary' | 'custom';
  details: {
    aliasCount?: number;
    photoCount?: number;
    relationshipCount?: number;
    bioSource?: string;
  };
  rollback_data?: {
    person: Person;
    photos: any[];
    relationships: any[];
  };
  status: 'active' | 'undone';
  created_at: string;
}

export interface DuplicatePair {
  personAId: string;
  personBId: string;
  similarity: number;
  reason: 'exact_alias' | 'alias_match' | 'name_similar' | 'alias_intersection';
}

export interface DuplicateGroup {
  groupId: string;
  personIds: string[];
  pairs: DuplicatePair[];
  details: Array<{
    id: string;
    name: string;
    aliases: string[];
    importance_score: number;
  }>;
}

export interface MergeRequest {
  projectId: string;
  primaryPersonId: string;
  secondaryPersonId: string;
  mergeStrategy: 'keep_primary' | 'keep_secondary' | 'custom';
  customData?: {
    name?: string;
    aliases?: string[];
    bio_snippet?: string;
    relationship_to_user?: string;
  };
}

export interface MergeResponse {
  success: boolean;
  mergedPerson?: Person;
  mergeLog?: {
    mergeLogId: string;
    aliasCount: number;
    photoCount: number;
    relationshipCount: number;
    deletedPersonId: string;
    mergedAt: string;
  };
  error?: string;
}

export interface DetectDuplicatesResponse {
  success: boolean;
  duplicateGroups: DuplicateGroup[];
  totalDuplicates: number;
  processingTime: number;
}
