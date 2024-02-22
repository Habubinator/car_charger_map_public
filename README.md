# API - Сar charger map

Car charger map - is a is a backend RERSTful API server with monolitic architecture.

## Installation

1. Download this git repository
2. Upackage zip file
3. Open or Powershell (or cmd) terminal and navigate to repository folder via cd console command
4. Make sure you have [NodeJS](https://nodejs.org/en/download) installed

```bash
node -v
```

5. Make sure you have [Node Package Manager](https://www.npmjs.com/package/npm) installed.

```bash
npm -v
```

6. Install dependencies into root folder

```bash
npm i
```

7. Run script in /src/database/schema materials/startup.sql inside your MySQL ORM to create database, tables and API data
8. Edit .env file inside root of the directory
9. You are good to go!

## Usage

If dependencies are installed, database is up, environment variables are in places - run the script

```bash
npm start
```

API documentation can be reviewed by this [documentation link](https://documenter.getpostman.com/view/28939212/2s9Yyy7HkB)

## Updating code

Before updating code - make sure to check if all other apis are working properly.

1. Add new js file to src/requests/apis folder. For your convinience you may want to copy other already existing API file
2. Make sure you recieve data in proper form of Array in execute function. Modify loop, data or used get methods (Use already written APIClass methods in the same folder)
3. At first you may want to change properties names that contain longitude and latitude to something API has

```javascript
let marker = await database.getMarker(
    station["longitude"],
    station["latitude"]
);
this.cords = {
    lon: station["longitude"],
    lat: station["latitude"],
};
```

4. Change createElement and other functions that are inside to proper data
5. Change updateElement and other functions that are inside to proper data

## License

MIT License

Copyright (c) 2024 Hudymenko Yevhenii

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
