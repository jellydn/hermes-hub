ALTER TABLE agent_skills
  ADD CONSTRAINT agent_skills_source_type_check
  CHECK (
    (source_type = 'custom' AND content IS NOT NULL AND install_ref IS NULL) OR
    ((source_type = 'hub' OR source_type = 'url') AND install_ref IS NOT NULL AND content IS NULL)
  );
