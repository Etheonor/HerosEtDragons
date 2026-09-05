-- Aligne les anciennes conditions codées en dur sur les noms officiels DRS
-- (catégorie « etats » du compendium). À appliquer local puis remote une fois.
UPDATE characters
SET conditions = replace(replace(conditions, '"Agrippé"', '"Empoigné"'), '"Effrayé"', '"Terrorisé"')
WHERE conditions LIKE '%Agrippé%' OR conditions LIKE '%Effrayé%';
