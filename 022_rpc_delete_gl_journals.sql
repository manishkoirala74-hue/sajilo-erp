CREATE OR REPLACE FUNCTION rpc_delete_gl_journals(p_source_id UUID, p_source_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM "GeneralLedgerLine" 
    WHERE journal_id IN (
        SELECT id FROM "GeneralLedgerJournal" 
        WHERE source_document_id = p_source_id 
          AND source_document_type = p_source_type
    );
    
    DELETE FROM "GeneralLedgerJournal" 
    WHERE source_document_id = p_source_id 
      AND source_document_type = p_source_type;
END;
$$;
