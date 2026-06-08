CREATE DATABASE `assessment`;
USE `assessment`;

CREATE TABLE users (
    id int NOT NULL AUTO_INCREMENT,
    username varchar(50) NOT NULL DEFAULT 'none',
    password varchar(255) NOT NULL,
    role enum('admin', 'user') NOT NULL DEFAULT 'user',
    PRIMARY KEY (id)
);