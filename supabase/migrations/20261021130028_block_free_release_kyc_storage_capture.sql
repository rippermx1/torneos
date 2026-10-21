BEGIN;

-- Fixed free-release scope: stop new ordinary-client KYC capture in this shared
-- database, including legacy RM14 forms. This is deliberately bucket-wide, not
-- an application/Origin distinction between clients carrying the same JWT.
-- Existing rows, read/delete policies, RM14 session/account checks, all other
-- buckets and trusted server privileges remain unchanged.
CREATE POLICY free_2048_kyc_no_client_insert
  ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'kyc-documents');

-- Also deny replacements and moves INTO KYC if another permissive UPDATE policy
-- is added later. Restrictive policies cannot independently grant any operation.
CREATE POLICY free_2048_kyc_no_client_update
  ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  WITH CHECK (bucket_id <> 'kyc-documents');

COMMIT;
