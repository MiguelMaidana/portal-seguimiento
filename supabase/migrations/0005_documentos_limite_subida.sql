-- El límite de tamaño ahora se aplica en Storage directamente: la
-- subida va del navegador a Supabase sin pasar por una función de
-- Next.js (que tiene un tope de cuerpo mucho menor que 25MB).
update storage.buckets
set file_size_limit = 26214400  -- 25MB, ver TAMANO_MAXIMO_DOCUMENTO_BYTES en packages/core
where id = 'documentos';
