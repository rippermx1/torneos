-- Disposable native fixture only: not a Storage API/RLS integration test.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,metadata jsonb,UNIQUE(bucket_id,name));
CREATE TABLE public.accounting_accounts(code text PRIMARY KEY,name text,category text,normal_balance text);
INSERT INTO public.accounting_accounts VALUES
 ('110100','Banco','asset','debit'),('110200','Flow','asset','debit'),('210100','IVA','liability','credit'),
 ('310100','Apertura','equity','credit'),('210200','Premios','liability','credit');
