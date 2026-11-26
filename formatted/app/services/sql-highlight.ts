export type SqlToken = {
  text: string;
  kind: 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'identifier';
};

const keywords = new Set(
  `select from where join inner left right full outer cross on as and or not
   null true false is in exists between like ilike distinct order by asc desc
   group having limit offset union all intersect except with recursive
   insert into values update set delete returning create alter drop table
   database schema index view function trigger returns language begin end
   declare if then else elsif loop for each row execute procedure before after
   primary foreign key references constraint unique check default cascade
   restrict serial bigserial integer int bigint smallint numeric decimal
   real double precision text varchar char boolean date timestamp time interval
   case when cast coalesce count sum avg min max transaction commit rollback
   savepoint release truncate copy to using replace conflict do nothing
   new old raise exception nulls first last over partition window`.split(/\s+/),
);
const simple =
  /\s+|--[^\r\n]*|(?:[eE])?'(?:''|\\[\s\S]|[^'])*(?:'|$)|"(?:""|[^"])*(?:"|$)|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_$]*|[\s\S]/uy;

export function sqlTokens(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let offset = 0;
  while (offset < source.length) {
    let end = offset;
    let kind: SqlToken['kind'] = 'plain';
    if (source.startsWith('/*', offset)) {
      let depth = 1;
      end += 2;
      while (end < source.length && depth) {
        if (source.startsWith('/*', end)) {
          depth++;
          end += 2;
        } else if (source.startsWith('*/', end)) {
          depth--;
          end += 2;
        } else end++;
      }
      kind = 'comment';
    } else {
      const dollar = /^\$(?:[A-Za-z_]\w*)?\$/.exec(source.slice(offset))?.[0];
      if (dollar) {
        const close = source.indexOf(dollar, offset + dollar.length);
        end = close < 0 ? source.length : close + dollar.length;
        kind = 'string';
      } else {
        simple.lastIndex = offset;
        const text = simple.exec(source)![0];
        end += text.length;
        if (text.startsWith('--')) kind = 'comment';
        else if (/^(?:[eE])?'/.test(text)) kind = 'string';
        else if (text.startsWith('"')) kind = 'identifier';
        else if (/^(?:\d|\.\d)/.test(text)) kind = 'number';
        else if (keywords.has(text.toLowerCase())) kind = 'keyword';
      }
    }
    tokens.push({text: source.slice(offset, end), kind});
    offset = end;
  }
  return tokens;
}
