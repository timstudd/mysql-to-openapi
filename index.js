const fs = require("fs");
const mysql = require("mysql");
const yaml = require("js-yaml");
require("dotenv").config();

const connection = mysql.createConnection({
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
});

connection.connect((err) => {
  if (err) throw err;

  const dbName = process.env.DB_NAME;

  const query = `
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  connection.query(query, [dbName], (err, results) => {
    if (err) throw err;

    const openapiDefinitions = {};

    results.forEach((row) => {
      const tableName = row.TABLE_NAME;
      const columnName = row.COLUMN_NAME;
      const columnComment = row.COLUMN_COMMENT;
      const columnDefault = row.COLUMN_DEFAULT;
      const columnType = row.COLUMN_TYPE;
      const dataType = row.DATA_TYPE;
      const allowNull = row.IS_NULLABLE === "YES";
      const isEnum = dataType == "enum";

      if (!openapiDefinitions[tableName]) {
        openapiDefinitions[tableName] = {
          type: "object",
          properties: {},
        };
      }

      openapiDefinitions[tableName].properties[columnName] = {
        type: dataType,
        ...(isEnum
          ? {
              enum: columnType
                .slice(5, columnType.length - 1)
                .split(",")
                .map((v) => v.replace(/^'|'$/g, "")),
            }
          : {}),
        ...(allowNull ? { required: false } : { required: true }),
        ...(columnComment ? { description: columnComment } : {}),
        ...(columnDefault ? { default: columnDefault } : {}),
      };
    });

    const openapiOutput = {
      swagger: "2.0",
      info: {
        title: `${dbName} Tables Schema`,
        version: "0.1.0",
      },
      definitions: openapiDefinitions,
    };

    fs.writeFileSync(`swagger/${dbName}.yaml`, yaml.dump(openapiOutput));
    console.log(`OpenAPI YAML for ${dbName} has been generated.`);
    connection.end();
  });
});
