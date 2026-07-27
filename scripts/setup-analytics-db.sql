-- Migration Script: Setup Analytics Demo Data Source Schema
-- Description: Creates dummy analytics tables (customers, products, orders), brief table descriptions, and populates 5 sample rows per table.
-- Connection Details: postgresql://analytics_user:analytics_password@localhost:5432/analytics_demo

-- 1. Create Schema and Role permissions
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'analytics_user') THEN
      CREATE ROLE analytics_user WITH LOGIN PASSWORD 'analytics_password';
   END IF;
END
$$;

-- 2. Drop existing tables if re-running migration
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- 3. Create 'customers' table
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    city VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    signup_date DATE NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE customers IS 'Stores customer profile information, location, and registration dates.';

-- 4. Create 'products' table
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
);

COMMENT ON TABLE products IS 'Catalog of available merchandise with pricing and stock levels.';

-- 5. Create 'orders' table
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'shipped', 'cancelled'))
);

COMMENT ON TABLE orders IS 'Customer purchase transactions recording quantities, total revenue, and status.';

-- 6. Insert 5 sample rows into 'customers'
INSERT INTO customers (customer_id, first_name, last_name, email, city, country, signup_date) VALUES
(1, 'Alice', 'Smith', 'alice.smith@example.com', 'New York', 'USA', '2024-01-15'),
(2, 'Bob', 'Jones', 'bob.jones@example.com', 'London', 'UK', '2024-02-20'),
(3, 'Charlie', 'Brown', 'charlie.brown@example.com', 'Toronto', 'Canada', '2024-03-10'),
(4, 'Diana', 'Prince', 'diana.prince@example.com', 'Sydney', 'Australia', '2024-04-05'),
(5, 'Ethan', 'Hunt', 'ethan.hunt@example.com', 'Berlin', 'Germany', '2024-05-12');

SELECT setval(pg_get_serial_sequence('customers', 'customer_id'), (SELECT MAX(customer_id) FROM customers));

-- 7. Insert 5 sample rows into 'products'
INSERT INTO products (product_id, product_name, category, price, stock_quantity) VALUES
(101, 'Wireless Ergonomic Mouse', 'Electronics', 49.99, 120),
(102, 'Mechanical Gaming Keyboard', 'Electronics', 129.50, 85),
(103, 'Noise Cancelling Headphones', 'Audio', 199.99, 45),
(104, 'Stainless Steel Water Bottle', 'Fitness', 24.95, 200),
(105, 'Standing Desk Converter', 'Furniture', 299.00, 30);

SELECT setval(pg_get_serial_sequence('products', 'product_id'), (SELECT MAX(product_id) FROM products));

-- 8. Insert 5 sample rows into 'orders'
INSERT INTO orders (order_id, customer_id, product_id, quantity, total_amount, order_date, status) VALUES
(1001, 1, 101, 2, 99.98, '2024-06-01 10:15:00', 'completed'),
(1002, 2, 103, 1, 199.99, '2024-06-02 14:30:00', 'completed'),
(1003, 3, 102, 1, 129.50, '2024-06-03 09:45:00', 'shipped'),
(1004, 1, 104, 3, 74.85, '2024-06-04 16:20:00', 'completed'),
(1005, 5, 105, 1, 299.00, '2024-06-05 11:00:00', 'pending');

SELECT setval(pg_get_serial_sequence('orders', 'order_id'), (SELECT MAX(order_id) FROM orders));

-- 9. Grant read permissions to analytics_user
GRANT USAGE ON SCHEMA public TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_user;
