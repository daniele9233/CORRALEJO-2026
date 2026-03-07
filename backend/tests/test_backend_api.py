"""
Backend API Test Suite for Mezzofondo Training App
Tests all endpoints: dashboard, runs, training-plan, profile, supplements, exercises, tests, AI analysis
"""
import pytest
import requests
import os

# Get base URL from environment - using the public URL for testing
BASE_URL = "https://mezzofondo-training.preview.emergentagent.com"

class TestHealthAndDashboard:
    """Test dashboard and basic health endpoints"""

    def test_dashboard_loads(self):
        """Test GET /api/dashboard returns valid data"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200, f"Dashboard failed with status {response.status_code}"
        
        data = response.json()
        assert 'profile' in data, "Dashboard missing profile"
        assert 'days_to_race' in data, "Dashboard missing days_to_race"
        assert 'recent_runs' in data, "Dashboard missing recent_runs"
        assert 'weekly_history' in data, "Dashboard missing weekly_history"
        assert data['days_to_race'] >= 0, "Days to race should be >= 0"
        print(f"✓ Dashboard loaded: {data['days_to_race']} days to race")

    def test_dashboard_countdown(self):
        """Verify countdown shows correct value"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        data = response.json()
        # Should be around 280 days as mentioned in test requirements
        assert 200 <= data['days_to_race'] <= 400, f"Unexpected countdown: {data['days_to_race']}"
        print(f"✓ Countdown verified: {data['days_to_race']} days")


class TestProfile:
    """Test profile endpoint"""

    def test_get_profile(self):
        """Test GET /api/profile returns complete profile"""
        response = requests.get(f"{BASE_URL}/api/profile")
        assert response.status_code == 200, f"Profile failed with status {response.status_code}"
        
        data = response.json()
        assert 'name' in data, "Profile missing name"
        assert 'age' in data, "Profile missing age"
        assert 'pbs' in data, "Profile missing PBs"
        assert 'injury' in data, "Profile missing injury info"
        assert 'target_time' in data, "Profile missing target_time"
        assert 'target_pace' in data, "Profile missing target_pace"
        
        # Verify PBs structure
        pbs = data['pbs']
        assert '5km' in pbs, "Missing 5km PB"
        assert '10km' in pbs, "Missing 10km PB"
        assert pbs['5km']['time'] == "20:35", "5km PB time mismatch"
        
        print(f"✓ Profile loaded: Age {data['age']}, Target {data['target_time']}, PBs: {len(pbs)}")


class TestTrainingPlan:
    """Test training plan endpoints"""

    def test_get_training_plan(self):
        """Test GET /api/training-plan returns full plan"""
        response = requests.get(f"{BASE_URL}/api/training-plan")
        assert response.status_code == 200, f"Training plan failed with status {response.status_code}"
        
        data = response.json()
        assert 'weeks' in data, "Training plan missing weeks"
        weeks = data['weeks']
        assert len(weeks) == 38, f"Expected 38 weeks, got {len(weeks)}"
        
        # Verify first week structure
        first_week = weeks[0]
        assert 'week_number' in first_week, "Week missing week_number"
        assert 'phase' in first_week, "Week missing phase"
        assert 'sessions' in first_week, "Week missing sessions"
        assert len(first_week['sessions']) == 7, f"Expected 7 sessions, got {len(first_week['sessions'])}"
        
        print(f"✓ Training plan loaded: {len(weeks)} weeks")

    def test_get_current_week(self):
        """Test GET /api/training-plan/current"""
        response = requests.get(f"{BASE_URL}/api/training-plan/current")
        assert response.status_code == 200, f"Current week failed with status {response.status_code}"
        
        data = response.json()
        assert 'week_number' in data, "Current week missing week_number"
        assert 'sessions' in data, "Current week missing sessions"
        
        print(f"✓ Current week: Week {data.get('week_number')}, Phase {data.get('phase')}")

    def test_toggle_session_complete(self):
        """Test PATCH /api/training-plan/session/complete"""
        # First get current week to get week_id
        week_response = requests.get(f"{BASE_URL}/api/training-plan/current")
        assert week_response.status_code == 200, "Failed to get current week"
        week_data = week_response.json()
        week_id = week_data['id']
        
        # Toggle first session to complete
        payload = {
            "week_id": week_id,
            "session_index": 0,
            "completed": True
        }
        response = requests.patch(
            f"{BASE_URL}/api/training-plan/session/complete",
            json=payload
        )
        assert response.status_code == 200, f"Toggle session failed with status {response.status_code}"
        assert response.json()['status'] == 'ok', "Toggle session didn't return ok status"
        
        # Verify it was actually toggled by getting week again
        verify_response = requests.get(f"{BASE_URL}/api/training-plan/current")
        verify_data = verify_response.json()
        assert verify_data['sessions'][0]['completed'] == True, "Session not marked as completed"
        
        # Toggle back to incomplete
        payload['completed'] = False
        response2 = requests.patch(
            f"{BASE_URL}/api/training-plan/session/complete",
            json=payload
        )
        assert response2.status_code == 200, "Failed to toggle back"
        
        print(f"✓ Session toggle working correctly")


class TestRuns:
    """Test runs CRUD endpoints"""

    def test_get_runs_list(self):
        """Test GET /api/runs returns list"""
        response = requests.get(f"{BASE_URL}/api/runs")
        assert response.status_code == 200, f"Get runs failed with status {response.status_code}"
        
        data = response.json()
        assert 'runs' in data, "Response missing runs array"
        runs = data['runs']
        assert len(runs) > 0, "Should have seed data runs"
        
        # Verify run structure
        first_run = runs[0]
        assert 'id' in first_run, "Run missing id"
        assert 'date' in first_run, "Run missing date"
        assert 'distance_km' in first_run, "Run missing distance_km"
        assert 'avg_pace' in first_run, "Run missing avg_pace"
        
        print(f"✓ Runs list loaded: {len(runs)} runs")

    def test_create_run_and_verify(self):
        """Test POST /api/runs and verify persistence with GET"""
        new_run = {
            "date": "2026-03-15",
            "distance_km": 5.5,
            "duration_minutes": 27.5,
            "avg_pace": "5:00",
            "avg_hr": 145,
            "max_hr": 160,
            "avg_hr_pct": 81,
            "max_hr_pct": 89,
            "run_type": "easy",
            "notes": "TEST_Run - Easy recovery run",
            "location": "Roma"
        }
        
        # Create run
        create_response = requests.post(f"{BASE_URL}/api/runs", json=new_run)
        assert create_response.status_code == 200, f"Create run failed with status {create_response.status_code}"
        
        created_data = create_response.json()
        assert 'id' in created_data, "Created run missing id"
        assert created_data['distance_km'] == new_run['distance_km'], "Distance mismatch"
        assert created_data['avg_pace'] == new_run['avg_pace'], "Pace mismatch"
        
        run_id = created_data['id']
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/runs/{run_id}")
        assert get_response.status_code == 200, f"Get run failed with status {get_response.status_code}"
        
        retrieved_data = get_response.json()
        assert 'run' in retrieved_data, "Response missing run object"
        assert retrieved_data['run']['id'] == run_id, "Run ID mismatch"
        assert retrieved_data['run']['notes'] == new_run['notes'], "Notes not persisted"
        
        print(f"✓ Run created and verified: {run_id}")

    def test_get_single_run(self):
        """Test GET /api/runs/{id} for existing run"""
        # First get list to get an ID
        list_response = requests.get(f"{BASE_URL}/api/runs")
        runs = list_response.json()['runs']
        assert len(runs) > 0, "No runs available for testing"
        
        run_id = runs[0]['id']
        
        # Get single run
        response = requests.get(f"{BASE_URL}/api/runs/{run_id}")
        assert response.status_code == 200, f"Get single run failed with status {response.status_code}"
        
        data = response.json()
        assert 'run' in data, "Response missing run"
        assert data['run']['id'] == run_id, "Run ID mismatch"
        
        print(f"✓ Single run retrieved: {run_id}")


class TestSupplementsAndExercises:
    """Test supplements and exercises endpoints"""

    def test_get_supplements(self):
        """Test GET /api/supplements returns 6 supplements"""
        response = requests.get(f"{BASE_URL}/api/supplements")
        assert response.status_code == 200, f"Supplements failed with status {response.status_code}"
        
        data = response.json()
        assert 'supplements' in data, "Response missing supplements"
        supps = data['supplements']
        assert len(supps) == 6, f"Expected 6 supplements, got {len(supps)}"
        
        # Verify structure
        first_supp = supps[0]
        assert 'name' in first_supp, "Supplement missing name"
        assert 'dosage' in first_supp, "Supplement missing dosage"
        assert 'timing' in first_supp, "Supplement missing timing"
        assert 'category' in first_supp, "Supplement missing category"
        
        print(f"✓ Supplements loaded: {len(supps)} items")

    def test_get_exercises(self):
        """Test GET /api/exercises returns 8 exercises"""
        response = requests.get(f"{BASE_URL}/api/exercises")
        assert response.status_code == 200, f"Exercises failed with status {response.status_code}"
        
        data = response.json()
        assert 'exercises' in data, "Response missing exercises"
        exercises = data['exercises']
        assert len(exercises) == 8, f"Expected 8 exercises, got {len(exercises)}"
        
        # Verify structure
        first_ex = exercises[0]
        assert 'name' in first_ex, "Exercise missing name"
        assert 'sets' in first_ex, "Exercise missing sets"
        assert 'reps' in first_ex, "Exercise missing reps"
        assert 'category' in first_ex, "Exercise missing category"
        
        print(f"✓ Exercises loaded: {len(exercises)} items")


class TestTests:
    """Test tests/schedule endpoints"""

    def test_get_tests(self):
        """Test GET /api/tests returns schedule"""
        response = requests.get(f"{BASE_URL}/api/tests")
        assert response.status_code == 200, f"Tests failed with status {response.status_code}"
        
        data = response.json()
        assert 'schedule' in data, "Response missing schedule"
        assert 'results' in data, "Response missing results"
        
        schedule = data['schedule']
        assert len(schedule) > 0, "Schedule should have items"
        
        # Verify schedule structure
        first_test = schedule[0]
        assert 'scheduled_date' in first_test, "Test missing scheduled_date"
        assert 'test_type' in first_test, "Test missing test_type"
        assert 'description' in first_test, "Test missing description"
        
        print(f"✓ Tests loaded: {len(schedule)} scheduled tests")


class TestAIAnalysis:
    """Test AI analysis endpoint (GPT-5.2)"""

    def test_ai_analyze_run(self):
        """Test POST /api/ai/analyze-run with GPT-5.2"""
        # Get a run ID first
        runs_response = requests.get(f"{BASE_URL}/api/runs")
        runs = runs_response.json()['runs']
        assert len(runs) > 0, "No runs available for AI analysis"
        
        run_id = runs[0]['id']
        
        # Request AI analysis
        payload = {"run_id": run_id}
        response = requests.post(
            f"{BASE_URL}/api/ai/analyze-run",
            json=payload,
            timeout=30  # AI calls can take time
        )
        assert response.status_code == 200, f"AI analysis failed with status {response.status_code}"
        
        data = response.json()
        assert 'id' in data, "Analysis missing id"
        assert 'run_id' in data, "Analysis missing run_id"
        assert 'analysis' in data, "Analysis missing analysis text"
        assert 'created_at' in data, "Analysis missing created_at"
        
        # Verify analysis has content
        analysis_text = data['analysis']
        assert len(analysis_text) > 50, "Analysis text too short"
        assert run_id == data['run_id'], "Run ID mismatch"
        
        print(f"✓ AI analysis working: {len(analysis_text)} chars generated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
