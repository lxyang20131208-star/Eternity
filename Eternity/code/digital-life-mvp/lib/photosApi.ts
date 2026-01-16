import { createClient } from '@supabase/supabase-js';
import type {
  Photo,
  Album,
  UploadReminder,
  PhotoFilters,
  PhotosQueryParams,
  AlbumWithPhotos,
  PhotoWithRelations,
  UnsortedStats,
} from './types/photos';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ====================================
// Photos API
// ====================================

export async function getPhotos(projectId: string, params?: PhotosQueryParams): Promise<Photo[]> {
  let query = supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId);

  // 应用筛选
  if (params?.filters) {
    const { filters } = params;
    
    if (filters.person_ids && filters.person_ids.length > 0) {
      query = query.overlaps('person_ids', filters.person_ids);
    }
    if (filters.place_ids && filters.place_ids.length > 0) {
      query = query.in('place_id', filters.place_ids);
    }
    if (filters.event_id) {
      query = query.eq('event_id', filters.event_id);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.is_sorted !== undefined) {
      query = query.eq('is_sorted', filters.is_sorted);
    }
    if (filters.date_range) {
      query = query.gte('taken_at', filters.date_range.start)
        .lte('taken_at', filters.date_range.end);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }
  }

  // 排序
  const sortField = params?.sort || 'uploaded_at';
  const sortOrder = params?.order || 'desc';
  query = query.order(sortField, { ascending: sortOrder === 'asc' });

  // 分页
  if (params?.limit) {
    query = query.limit(params.limit);
  }
  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 20) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPhoto(photoId: string): Promise<PhotoWithRelations | null> {
  const { data: photo, error } = await supabase
    .from('photos')
    .select('*')
    .eq('id', photoId)
    .single();

  if (error) throw error;
  if (!photo) return null;

  // 获取关联的地点
  if (photo.place_id) {
    const { data: place } = await supabase
      .from('places')
      .select('*')
      .eq('id', photo.place_id)
      .single();
    photo.place = place;
  }

  // 获取关联的事件
  if (photo.event_id) {
    const { data: event } = await supabase
      .from('events')
      .select('*')
      .eq('id', photo.event_id)
      .single();
    photo.event = event;
  }

  // 获取关联的人物
  if (photo.person_ids && photo.person_ids.length > 0) {
    const { data: people } = await supabase
      .from('people')
      .select('*')
      .in('id', photo.person_ids);
    photo.people = people || [];
  }

  return photo as PhotoWithRelations;
}

export async function createPhoto(photo: Partial<Photo>): Promise<Photo> {
  const { data, error } = await supabase
    .from('photos')
    .insert(photo)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updatePhoto(photoId: string, updates: Partial<Photo>): Promise<Photo> {
  const { data, error } = await supabase
    .from('photos')
    .update(updates)
    .eq('id', photoId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deletePhoto(photoId: string): Promise<void> {
  // 先删除存储中的文件
  const { data: photo } = await supabase
    .from('photos')
    .select('url, thumb_url')
    .eq('id', photoId)
    .single();

  if (photo) {
    // 删除原图
    if (photo.url) {
      const path = photo.url.split('/').pop();
      if (path) {
        await supabase.storage.from('photos').remove([path]);
      }
    }
    // 删除缩略图
    if (photo.thumb_url) {
      const thumbPath = photo.thumb_url.split('/').pop();
      if (thumbPath) {
        await supabase.storage.from('photos').remove([thumbPath]);
      }
    }
  }

  // 删除数据库记录
  const { error } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId);
  
  if (error) throw error;
}

export async function batchUpdatePhotos(photoIds: string[], updates: Partial<Photo>): Promise<void> {
  const { error } = await supabase
    .from('photos')
    .update(updates)
    .in('id', photoIds);
  
  if (error) throw error;
}

// ====================================
// Albums API
// ====================================

export async function getAlbums(projectId: string): Promise<Album[]> {
  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getAlbum(albumId: string): Promise<AlbumWithPhotos | null> {
  const { data: album, error } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .single();

  if (error) throw error;
  if (!album) return null;

  // 获取相册中的照片
  const { data: albumPhotos } = await supabase
    .from('album_photos')
    .select('photo_id, display_order')
    .eq('album_id', albumId)
    .order('display_order');

  if (albumPhotos && albumPhotos.length > 0) {
    const photoIds = albumPhotos.map(ap => ap.photo_id);
    const { data: photos } = await supabase
      .from('photos')
      .select('*')
      .in('id', photoIds);
    
    // 按 display_order 排序
    album.photos = photoIds.map(id => 
      photos?.find(p => p.id === id)
    ).filter(Boolean);
  }

  // 获取封面照片
  if (album.cover_photo_id) {
    const { data: cover } = await supabase
      .from('photos')
      .select('*')
      .eq('id', album.cover_photo_id)
      .single();
    album.cover_photo = cover;
  }

  return album as AlbumWithPhotos;
}

export async function createAlbum(album: Partial<Album>): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .insert(album)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateAlbum(albumId: string, updates: Partial<Album>): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .update(updates)
    .eq('id', albumId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const { error } = await supabase
    .from('albums')
    .delete()
    .eq('id', albumId);
  
  if (error) throw error;
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<void> {
  const albumPhotos = photoIds.map((photoId, index) => ({
    album_id: albumId,
    photo_id: photoId,
    display_order: index,
  }));

  const { error } = await supabase
    .from('album_photos')
    .insert(albumPhotos);
  
  if (error) throw error;
}

export async function removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('album_photos')
    .delete()
    .eq('album_id', albumId)
    .in('photo_id', photoIds);
  
  if (error) throw error;
}

// ====================================
// Upload Reminders API
// ====================================

export async function getActiveReminders(projectId: string): Promise<UploadReminder[]> {
  const { data, error } = await supabase
    .from('upload_reminders')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['pending', 'snoozed'])
    .or(`snooze_until.is.null,snooze_until.lte.${new Date().toISOString()}`)
    .order('triggered_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function createReminder(reminder: Partial<UploadReminder>): Promise<UploadReminder> {
  const { data, error } = await supabase
    .from('upload_reminders')
    .insert(reminder)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateReminderStatus(
  reminderId: string,
  status: UploadReminder['status'],
  snoozeUntil?: string
): Promise<void> {
  const updates: Partial<UploadReminder> = { status };
  
  if (status === 'snoozed' && snoozeUntil) {
    updates.snooze_until = snoozeUntil;
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('upload_reminders')
    .update(updates)
    .eq('id', reminderId);
  
  if (error) throw error;
}

// ====================================
// 统计与查询
// ====================================

export async function getUnsortedStats(projectId: string): Promise<UnsortedStats> {
  const { data, error } = await supabase
    .from('unsorted_photos_stats')
    .select('*')
    .eq('project_id', projectId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  
  return data || { project_id: projectId, unsorted_count: 0 };
}

export async function getPhotosByPerson(projectId: string, personId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId)
    .contains('person_ids', [personId])
    .order('taken_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getPhotosByPlace(projectId: string, placeId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId)
    .eq('place_id', placeId)
    .order('taken_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getPhotosByEvent(projectId: string, eventId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId)
    .eq('event_id', eventId)
    .order('taken_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}
