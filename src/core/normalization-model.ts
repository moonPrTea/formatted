import type {Dataset, Row} from '../../packages/contracts/practice.js';

interface Relation {
  name: string;
  fields: string[];
  rows: Row[];
  parents: string[];
}

export function normalizationModel(data: Dataset): Relation[] {
  if (data.version < 2 || !data.sources)
    throw new Error('Проверка доступна для вариантов с тремя CSV');
  const [catalog, users, operations] = (data.modelSources ?? data.sources).map(
    source =>
      source.rows.map(row =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === 'string' ? v.trim() : v,
          ]),
        ),
      ),
  );
  const relations: Relation[] = [];
  const add = (name: string, rows: Row[], fields: string, parents = '') => {
    const columns = fields.split(' ');
    const projected = rows.map(row =>
      Object.fromEntries(columns.map(field => [field, row[field]])),
    );
    relations.push({
      name,
      fields: columns,
      parents: parents ? parents.split(' ') : [],
      rows: [
        ...new Map(projected.map(row => [JSON.stringify(row), row])).values(),
      ],
    });
  };
  add('cities', users, 'city region');
  add('roles', users, 'role role_description');
  add('users', users, 'user_code full_name login role city', 'roles cities');
  add('statuses', operations, 'status status_description');
  if (data.config.domain === 'retail') {
    add('categories', catalog, 'category category_description');
    add('subcategories', catalog, 'subcategory category', 'categories');
    add('manufacturers', catalog, 'manufacturer manufacturer_phone');
    add('sizes', catalog, 'size size_system');
    add(
      'products',
      catalog,
      'product_code product_name subcategory manufacturer current_price',
      'subcategories manufacturers',
    );
    add(
      'stock',
      catalog,
      'stock_code product_code size available',
      'products sizes',
    );
    add(
      'orders',
      operations,
      'order_id order_date user_code status',
      'users statuses',
    );
    add(
      'lines',
      operations,
      'order_id line_no stock_code quantity unit_price',
      'orders stock',
    );
  } else if (data.config.domain === 'library') {
    const authors = catalog.flatMap(row =>
      String(row.author_codes)
        .split(' | ')
        .map((code, i) => ({
          book_code: row.book_code,
          author_code: code,
          author_name: String(row.author_names).split(' | ')[i],
        })),
    );
    add('publishers', catalog, 'publisher publisher_phone');
    add('genres', catalog, 'genre genre_description');
    add(
      'books',
      catalog,
      'book_code book_title publisher genre',
      'publishers genres',
    );
    add('authors', authors, 'author_code author_name');
    add('bookAuthors', authors, 'book_code author_code', 'books authors');
    add('branches', catalog, 'branch branch_address');
    add(
      'copies',
      catalog,
      'copy_code book_code branch shelf replacement_cost',
      'books branches',
    );
    add(
      'loans',
      operations,
      'loan_id loan_date user_code copy_code days status',
      'users copies statuses',
    );
  } else {
    add('directions', catalog, 'direction direction_description');
    add('levels', catalog, 'level level_description');
    add(
      'courses',
      catalog,
      'course_code course_title direction level hours',
      'directions levels',
    );
    add('buildings', catalog, 'building building_address');
    add(
      'rooms',
      catalog,
      'room_code room_number capacity building',
      'buildings',
    );
    add('formats', catalog, 'format format_description');
    add(
      'cohorts',
      catalog,
      'cohort_code course_code teacher_code room_code format start_date',
      'courses users rooms formats',
    );
    add(
      'enrollments',
      operations,
      'enrollment_id enrollment_date user_code cohort_code fee status',
      'users cohorts statuses',
    );
  }
  return relations;
}
