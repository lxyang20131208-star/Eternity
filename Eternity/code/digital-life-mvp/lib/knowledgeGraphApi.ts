import { supabase } from './supabaseClient';
import type {
  Person,
  Place,
  Event,
  Memory,
  TimeRef,
  PersonWithRelations,
  EventWithRelations,
  PlaceWithRelations,
  TimelineFilters,
  PlaceFilters,
  PeopleFilters,
} from './types/knowledge-graph';

// Using singleton `supabase` from `lib/supabaseClient` to avoid multiple GoTrueClient instances

// ====================================
// People API
// ====================================

export async function getPeople(projectId: string, filters?: PeopleFilters): Promise<Person[]> {
  let query = supabase
    .from('people')
    .select('*')
    .eq('project_id', projectId)
    .order('importance_score', { ascending: false });

  if (filters?.roles && filters.roles.length > 0) {
    query = query.in('role', filters.roles);
  }
  if (filters?.minImportance !== undefined) {
    query = query.gte('importance_score', filters.minImportance);
  }
  if (filters?.hasAvatar) {
    query = query.not('avatar_url', 'is', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPerson(personId: string): Promise<PersonWithRelations | null> {
  const { data: person, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', personId)
    .single();

  if (error) throw error;
  if (!person) return null;

  // 获取相关回忆
  const { data: memories } = await supabase
    .from('memories')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
    .limit(10);

  // 获取相关事件
  const { data: eventPeople } = await supabase
    .from('event_people')
    .select('event_id')
    .eq('person_id', personId);

  const eventIds = eventPeople?.map((ep) => ep.event_id) || [];
  let events: Event[] = [];
  if (eventIds.length > 0) {
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds)
      .order('created_at', { ascending: false });
    events = eventsData || [];
  }

  // 获取时间范围
  const { data: timeRefs } = await supabase
    .from('time_refs')
    .select('start_date, end_date')
    .in(
      'id',
      [...(memories?.map((m) => m.time_ref_id).filter(Boolean) || []), ...(events.map((e) => e.time_ref_id).filter(Boolean))]
    );

  let earliestDate: string | undefined;
  let latestDate: string | undefined;
  if (timeRefs && timeRefs.length > 0) {
    const dates = timeRefs
      .flatMap((tr) => [tr.start_date, tr.end_date])
      .filter((d): d is string => d !== null && d !== undefined);
    if (dates.length > 0) {
      earliestDate = dates.reduce((a, b) => (a < b ? a : b));
      latestDate = dates.reduce((a, b) => (a > b ? a : b));
    }
  }

  return {
    ...person,
    memories: memories || [],
    events,
    memoryCount: memories?.length || 0,
    earliestDate,
    latestDate,
  };
}

export async function createPerson(person: Partial<Person>): Promise<Person> {
  const { data, error } = await supabase.from('people').insert(person).select().single();
  if (error) throw error;
  return data;
}

export async function updatePerson(personId: string, updates: Partial<Person>): Promise<Person> {
  const { data, error } = await supabase.from('people').update(updates).eq('id', personId).select().single();
  if (error) throw error;
  return data;
}

export async function deletePerson(personId: string): Promise<void> {
  const { error } = await supabase.from('people').delete().eq('id', personId);
  if (error) throw error;
}

// ====================================
// Events API
// ====================================

export async function getEvents(projectId: string, filters?: TimelineFilters): Promise<EventWithRelations[]> {
  let query = supabase
    .from('events')
    .select('*, time_refs(*)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (filters?.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }
  if (filters?.verified !== undefined) {
    query = query.eq('verified', filters.verified);
  }

  const { data: events, error } = await query;
  if (error) throw error;
  if (!events) return [];

  // 获取关联人物和地点
  const eventIds = events.map((e) => e.id);

  const { data: eventPeople } = await supabase.from('event_people').select('event_id, person_id, people(*)').in('event_id', eventIds);

  const { data: eventPlaces } = await supabase.from('event_places').select('event_id, place_id, places(*)').in('event_id', eventIds);

  return events.map((event) => ({
    ...event,
    tags: event.tags || [],
    timeRef: event.time_refs,
    people: eventPeople?.filter((ep) => ep.event_id === event.id).map((ep) => ep.people as any) || [],
    places: eventPlaces?.filter((ep) => ep.event_id === event.id).map((ep) => ep.places as any) || [],
  }));
}

export async function createEvent(event: Partial<Event>, peopleIds?: string[], placeIds?: string[]): Promise<Event> {
  const { data, error } = await supabase.from('events').insert(event).select().single();
  if (error) throw error;

  // 关联人物
  if (peopleIds && peopleIds.length > 0) {
    const eventPeople = peopleIds.map((personId) => ({
      event_id: data.id,
      person_id: personId,
    }));
    await supabase.from('event_people').insert(eventPeople);
  }

  // 关联地点
  if (placeIds && placeIds.length > 0) {
    const eventPlaces = placeIds.map((placeId) => ({
      event_id: data.id,
      place_id: placeId,
    }));
    await supabase.from('event_places').insert(eventPlaces);
  }

  return data;
}

export async function updateEvent(eventId: string, updates: Partial<Event>): Promise<Event> {
  const { data, error } = await supabase.from('events').update(updates).eq('id', eventId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ====================================
// Places API
// ====================================

export async function getPlaces(projectId: string, filters?: PlaceFilters): Promise<PlaceWithRelations[]> {
  let query = supabase.from('places').select('*').eq('project_id', projectId).order('name');

  if (filters?.placeLevel) {
    query = query.eq('place_level', filters.placeLevel);
  }

  const { data: places, error } = await query;
  if (error) {
    console.error('getPlaces query error:', error);
    throw error;
  }
  
  if (!places || places.length === 0) {
    return [];
  }

  // 如果需要事件信息
  if (filters?.hasEvents) {
    const placeIds = places.map((p) => p.id);
    const { data: eventPlaces, error: eventError } = await supabase.from('event_places').select('place_id, events(*)').in('place_id', placeIds);
    
    if (eventError) {
      console.warn('Failed to fetch event_places:', eventError);
      // Fallback to places without events if events fetch fails
      return places;
    }

    return places.map((place) => ({
      ...place,
      events: eventPlaces?.filter((ep) => ep.place_id === place.id).map((ep) => ep.events as any) || [],
    }));
  }

  return places;
}

export async function getPlace(placeId: string): Promise<PlaceWithRelations | null> {
  const { data: place, error } = await supabase.from('places').select('*').eq('id', placeId).single();

  if (error) throw error;
  if (!place) return null;

  // 获取子地点
  const { data: childPlaces } = await supabase.from('places').select('*').eq('parent_place_id', placeId);

  // 获取相关事件
  const { data: eventPlaces } = await supabase.from('event_places').select('events(*)').eq('place_id', placeId);

  // 获取相关人物（通过事件）
  const eventIds = eventPlaces?.map((ep) => (ep.events as any).id) || [];
  let people: Person[] = [];
  if (eventIds.length > 0) {
    const { data: eventPeople } = await supabase.from('event_people').select('people(*)').in('event_id', eventIds);
    people = eventPeople?.map((ep) => ep.people as any) || [];
  }

  return {
    ...place,
    childPlaces: childPlaces || [],
    events: eventPlaces?.map((ep) => ep.events as any) || [],
    people,
  };
}

export async function createPlace(place: Partial<Place>): Promise<Place> {
  const { data, error } = await supabase.from('places').insert(place).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlace(placeId: string, updates: Partial<Place>): Promise<Place> {
  const { data, error } = await supabase.from('places').update(updates).eq('id', placeId).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlace(placeId: string): Promise<void> {
  const { error } = await supabase.from('places').delete().eq('id', placeId);
  if (error) throw error;
}

// ====================================
// Memories API
// ====================================

export async function getMemories(projectId: string): Promise<Memory[]> {
  const { data, error } = await supabase.from('memories').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMemory(memory: Partial<Memory>): Promise<Memory> {
  const { data, error } = await supabase.from('memories').insert(memory).select().single();
  if (error) throw error;
  return data;
}

export async function updateMemory(memoryId: string, updates: Partial<Memory>): Promise<Memory> {
  const { data, error } = await supabase.from('memories').update(updates).eq('id', memoryId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const { error } = await supabase.from('memories').delete().eq('id', memoryId);
  if (error) throw error;
}

// ====================================
// TimeRefs API
// ====================================

export async function createTimeRef(timeRef: Partial<TimeRef>): Promise<TimeRef> {
  const { data, error } = await supabase.from('time_refs').insert(timeRef).select().single();
  if (error) throw error;
  return data;
}
