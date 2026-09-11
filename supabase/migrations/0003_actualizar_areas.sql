-- ============================================================
-- Ajuste de verticales: se elimina Claro (sin tareas) y Equipo
-- pasa a llamarse Producto Digital.
-- ============================================================

delete from areas where slug = 'claro';

update areas
set nombre = 'Producto Digital',
    slug = 'producto-digital'
where slug = 'equipo';
