-- ============================================================
-- Datos iniciales. Editá libremente: son tus campos y tu gente.
-- ============================================================

insert into areas (nombre, slug, color, descripcion, orden) values
  ('Implementación', 'implementacion', 'teal',  'Puesta en marcha de kits, agentes y MCPs',        10),
  ('HUB IA',         'hub-ia',         'ochre', 'Programa de adopción de IA en TSOFT',             20),
  ('Claro',          'claro',          'plum',  'Iniciativas IA, migración STL, calidad',          30),
  ('Propuestas',     'propuestas',     'slate', 'Armado comercial y preventa',                     40),
  ('Equipo',         'equipo',         'moss',  'Asignaciones, seguimiento y 1:1 del equipo',      50),
  ('Personal',       'personal',       'grey',  'Todo lo que no es trabajo',                       60)
on conflict (nombre) do nothing;

insert into personas (nombre, alias, rol) values
  ('Mabel Naddaf',     array['mabel'],                    'Customer Success Manager'),
  ('Alejandro Varela', array['ale varela', 'varela'],     'Contraparte técnica'),
  ('Emiliano Caresia', array['emiliano', 'caresia'],      'Claro'),
  ('Jose Gho',         array['gho'],                      'Claro'),
  ('Leandro Rojas',    array['lean', 'rojas'],            'Equipo'),
  ('Roberto Arias',    array['roberto', 'arias'],         'Equipo'),
  ('Federico Perrone', array['fede', 'perrone'],          'Equipo')
on conflict (nombre) do nothing;
