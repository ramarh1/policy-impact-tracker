# Policy Impact Tracker

The Policy Impact Tracker is a data visualization tool designed to analyze how public policies and programs affect Philadelphia neighborhoods.
It supports data-driven decision-making and community advocacy.

## Features

- Interactive map showing policy impacts by census tract
- Dynamic filters for year, category, and demographic variables
- Integration with public (Census, OpenDataPhilly) and internal data
- Neighborhood summaries (income, poverty, race, program participation)
- CSV export and reporting options
- Responsive and mobile-friendly interface

## Tech Stack

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Frontend      | React 18, TypeScript, Vite, Tailwind CSS                   |
| Backend       | Flask, Python 3.12, SQLAlchemy, GeoPandas                  |
| Database      | SQLite (local) or PostgreSQL (production)                  |
| Visualization | Leaflet, MapClassify, Folium, Matplotlib                   |
| Data Sources  | ACS 5-Year (Census), OpenDataPhilly 311 |
| Deployment    | Render, Docker, GitHub Pages                               |

## Project Structure

```
policy-impact-tracker/
├── backend/
│   ├── app.py
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── data/
│   ├── shapefiles/
│   ├── census/
│   └── outputs/
│
├── .env.example
├── docker-compose.yml
└── README.md
```

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/policy-impact-tracker.git
cd policy-impact-tracker
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
# or
source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
python app.py
```

API runs at `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Environment Variables

Create a `.env` file in `/backend`:

```
CENSUS_API_KEY=your_api_key_here
OPEN_DATA_URL=https://opendataphilly.org
DATABASE_URL=sqlite:///data/policy_tracker.db
```

## Data Sources

| Source             | Description               | Frequency  |
| ------------------ | ------------------------- | ---------- |
| ACS 5-Year         | Census socioeconomic data | Annual     |
| OpenDataPhilly 311 | Service request data      | Weekly     |

## Methodology

1. Data collected via Census and 311 APIs.
2. Cleaned and merged by geographic identifier (tract or ZIP code).
3. Data classified into impact levels using Quantiles or Natural Breaks.
4. Results visualized via Flask API and Leaflet frontend.
5. Database updated weekly via cron job or Render scheduler.

## Example API Routes

| Endpoint         | Description                        |
| ---------------- | ---------------------------------- |
| `/api/tracts`  | Census tracts and demographic data |
| `/api/impacts` | Policy impact scores by tract      |
| `/api/filters` | Filter options (year, category)    |
| `/api/update`  | Triggers data refresh              |

## Contributing

1. Fork the repository.
2. Create a branch (`git checkout -b feature/new-feature`).
3. Commit changes and open a pull request.

## License

MIT License © 2025 

## Contact

Maintainer: Ramar Huntley
Email: N/A
Website: ramarhuntley.com
