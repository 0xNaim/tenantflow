-- Runtime application role must not modify or delete audit records.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE "AuditLog"
FROM tenantflow_app;

GRANT SELECT, INSERT
ON TABLE "AuditLog"
TO tenantflow_app;


-- Database-level protection against accidental mutations.
CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuditLog is append-only. UPDATE and DELETE are not allowed.';
END;
$$;


CREATE TRIGGER audit_log_prevent_mutation
BEFORE UPDATE OR DELETE
ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION reject_audit_log_mutation();
