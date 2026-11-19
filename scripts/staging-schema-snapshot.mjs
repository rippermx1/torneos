import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Catalog-only export for an offline compatibility rehearsal. No row data,
// credentials, cron jobs, Auth identities or Storage file contents are exported.
export const schemaSnapshotSql = `BEGIN READ ONLY;
WITH relations AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname IN ('public','private') OR (n.nspname='storage' AND c.relname IN ('buckets','objects'))) AND c.relkind IN ('r','v')
), routines AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
)
SELECT jsonb_build_object(
 'schema',1,'observed_at',clock_timestamp(),'scope','commercial catalog and storage metadata relations; no data or full Supabase recovery claim',
 'enums',(SELECT coalesce(jsonb_agg(format('CREATE TYPE %I.%I AS ENUM (%s);',n.nspname,t.typname,(SELECT string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))),'[]'::jsonb) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private','storage') AND t.typtype='e'),
 'sequences',(SELECT coalesce(jsonb_agg(format('CREATE SEQUENCE %I.%I AS %s START WITH %s INCREMENT BY %s MINVALUE %s MAXVALUE %s CACHE %s %s;',n.nspname,c.relname,format_type(s.seqtypid,NULL),s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,CASE WHEN s.seqcycle THEN 'CYCLE' ELSE 'NO CYCLE' END)),'[]'::jsonb) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='i')),
 'tables',(SELECT jsonb_agg(format('CREATE TABLE %I.%I (%s);',c.nspname,c.relname,(SELECT string_agg(format('%I %s%s%s',a.attname,format_type(a.atttypid,a.atttypmod),CASE WHEN a.attidentity<>'' THEN ' GENERATED '||CASE WHEN a.attidentity='a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END||' AS IDENTITY' WHEN a.attgenerated<>'' THEN ' GENERATED ALWAYS AS ('||pg_get_expr(d.adbin,d.adrelid)||') STORED' WHEN d.adbin IS NOT NULL THEN ' DEFAULT '||pg_get_expr(d.adbin,d.adrelid) ELSE '' END,CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END),',' ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.nspname,c.relname) FROM relations c WHERE c.relkind='r'),
 'functions',(SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.nspname,p.proname,p.oid) FROM routines p),
 'constraints',(SELECT jsonb_agg(format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;',c.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) ORDER BY (k.contype='f'),c.nspname,c.relname,k.conname) FROM pg_constraint k JOIN relations c ON c.oid=k.conrelid WHERE c.relkind='r'),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid)||';'),'[]'::jsonb) FROM pg_index i JOIN relations c ON c.oid=i.indrelid WHERE NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid)),
 'views',(SELECT coalesce(jsonb_agg(format('CREATE VIEW %I.%I%s AS %s',c.nspname,c.relname,CASE WHEN c.reloptions IS NULL THEN '' ELSE ' WITH ('||array_to_string(c.reloptions,',')||')' END,pg_get_viewdef(c.oid)) ORDER BY c.oid),'[]'::jsonb) FROM relations c WHERE c.relkind='v'),
 'rls',(SELECT jsonb_agg(format('ALTER TABLE %I.%I %s ROW LEVEL SECURITY;%s',c.nspname,c.relname,CASE WHEN c.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END,CASE WHEN c.relforcerowsecurity THEN format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;',c.nspname,c.relname) ELSE '' END)) FROM relations c WHERE c.relkind='r'),
 'policies',(SELECT coalesce(jsonb_agg(format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',p.polname,c.nspname,c.relname,CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,(SELECT string_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r)) END,',') FROM unnest(p.polroles) r),CASE WHEN p.polqual IS NULL THEN '' ELSE ' USING ('||pg_get_expr(p.polqual,p.polrelid)||')' END,CASE WHEN p.polwithcheck IS NULL THEN '' ELSE ' WITH CHECK ('||pg_get_expr(p.polwithcheck,p.polrelid)||')' END)),'[]'::jsonb) FROM pg_policy p JOIN relations c ON c.oid=p.polrelid),
 'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid)||';'||CASE WHEN t.tgenabled='D' THEN format('ALTER TABLE %I.%I DISABLE TRIGGER %I;',c.nspname,c.relname,t.tgname) ELSE '' END),'[]'::jsonb) FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.nspname IN ('public','private')),
 'table_grants',(SELECT coalesce(jsonb_agg(format('GRANT %s ON TABLE %I.%I TO %s;',a.privilege_type,c.nspname,c.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END)),'[]'::jsonb) FROM relations c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
 'column_grants',(SELECT coalesce(jsonb_agg(format('GRANT %s (%I) ON TABLE %I.%I TO %s;',g.privilege_type,a.attname,c.nspname,c.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END)),'[]'::jsonb) FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN LATERAL aclexplode(a.attacl) g),
 'function_grants',(SELECT coalesce(jsonb_agg(format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %s;',p.nspname,p.proname,oidvectortypes(p.proargtypes),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END)),'[]'::jsonb) FROM routines p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE'),
 'function_revokes',(SELECT jsonb_agg(format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon,authenticated,service_role;',p.nspname,p.proname,oidvectortypes(p.proargtypes))) FROM routines p),
 'bucket_config',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) FROM storage.buckets WHERE id IN ('kyc-documents','payout-proofs'))
) AS snapshot;
ROLLBACK;`
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 const output=process.argv[2] ?? 'artifacts/staging/schema-snapshot.sql'; fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,schemaSnapshotSql+'\n');console.log(JSON.stringify({output,scope:'SQL file only; catalog reads'}))
}
