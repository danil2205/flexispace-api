SELECT 'CREATE DATABASE flexispace' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'flexispace')\gexec
SELECT 'CREATE DATABASE flexispace_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'flexispace_test')\gexec
