"""Live quiz, mini-game scores and the teacher shop."""

import pytest
from django.core.cache import cache

from games.models import GameSession
from shop.models import Order, Product

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def quiz(as_user, teacher):
    resp = as_user(teacher).post("/api/games/quizzes/", {
        "title": "Mexanika viktorinasi",
        "questions": [
            {"text": "Kuch birligi?", "options": ["N", "J", "W"], "correct": 0, "time_limit": 20},
            {"text": "Tezlik birligi?", "options": ["m/s", "kg"], "correct": 0, "time_limit": 20},
        ],
    }, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data


def test_live_quiz_flow(as_user, jwt_as, teacher, student, quiz, journal_class):
    host = as_user(teacher)
    session = host.post("/api/games/sessions/", {"quiz": quiz["id"], "journal_class": journal_class.id}, format="json").data
    pin, sid = session["pin"], session["id"]

    player = jwt_as(student)  # through the real portal gate
    joined = player.post("/api/games/play/join/", {"pin": pin}, format="json")
    assert joined.status_code == 200

    host.post(f"/api/games/sessions/{sid}/next/")
    state = player.get(f"/api/games/play/{sid}/state/").data
    assert state["status"] == "question" and "correct" not in state["question"]

    ans = player.post(f"/api/games/play/{sid}/answer/", {"choice": 0}, format="json")
    assert ans.status_code == 200 and ans.data["me"]["score"] > 500
    assert player.post(f"/api/games/play/{sid}/answer/", {"choice": 1}, format="json").status_code == 400

    host.post(f"/api/games/sessions/{sid}/reveal/")
    state = player.get(f"/api/games/play/{sid}/state/").data
    assert state["question"]["correct"] == 0 and state["result"]["is_correct"] is True

    host.post(f"/api/games/sessions/{sid}/next/")
    final = host.post(f"/api/games/sessions/{sid}/next/").data
    assert final["status"] == "finished"


def test_game_restricted_to_class(as_user, make_student, teacher, quiz, journal_class):
    from journal.models import JournalClass

    other = JournalClass.objects.create(teacher=teacher, name="9-B")
    outsider = make_student(other, name="Begona Bola")
    session = as_user(teacher).post("/api/games/sessions/", {"quiz": quiz["id"], "journal_class": journal_class.id}, format="json").data
    assert as_user(outsider).post("/api/games/play/join/", {"pin": session["pin"]}, format="json").status_code == 403


def test_non_player_cannot_read_game_state(as_user, make_student, teacher, quiz, journal_class):
    session = as_user(teacher).post("/api/games/sessions/", {"quiz": quiz["id"]}, format="json").data
    lurker = make_student(journal_class, name="Karimova Nodira")
    assert as_user(lurker).get(f"/api/games/play/{session['id']}/state/").status_code == 403


def test_other_teacher_cannot_drive_session(as_user, make_user, teacher, quiz):
    session = as_user(teacher).post("/api/games/sessions/", {"quiz": quiz["id"]}, format="json").data
    other = make_user("other@example.com", approved=True)
    assert as_user(other).post(f"/api/games/sessions/{session['id']}/next/").status_code == 404
    assert GameSession.objects.get(pk=session["id"]).status == "lobby"


def test_mini_game_score_bounds(jwt_as, student):
    client = jwt_as(student)
    ok = client.post("/api/games/mini/scores/", {"game": "units", "score": 900, "correct": 8, "total": 10, "duration_sec": 40}, format="json")
    assert ok.status_code == 201
    cheat = client.post("/api/games/mini/scores/", {"game": "units", "score": 99999, "correct": 8, "total": 10, "duration_sec": 40}, format="json")
    assert cheat.status_code == 400
    board = client.get("/api/games/mini/leaderboard/", {"game": "units"}).data
    assert board["my_best"] == 900


# ── Shop ───────────────────────────────────────────────────────────────

@pytest.fixture
def product(as_user, admin):
    resp = as_user(admin).post("/api/shop/products/", {
        "title": "8-sinf ishlanmalar to'plami", "kind": "toplam", "price": 50000,
        "content_url": "https://drive.google.com/secret", "content_note": "Parol: fizika",
    }, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data


def test_shop_purchase_flow(as_user, teacher, admin, product):
    listed = as_user(teacher).get(f"/api/shop/products/{product['id']}/").data
    assert listed["content_url"] == "" and listed["content_note"] == ""

    # A client-sent price is ignored.
    order = as_user(teacher).post("/api/shop/orders/", {"items": [{"product": product["id"], "price": 1}]}, format="json")
    assert order.status_code == 201 and order.data["total"] == 50000 and order.data["status"] == "pending"
    oid = order.data["id"]
    # Buyer can't confirm their own payment.
    assert as_user(teacher).post(f"/api/shop/orders/{oid}/confirm/").status_code == 403
    assert as_user(teacher).post(f"/api/shop/orders/{oid}/report-payment/", {"payment_note": "14:20, 50 000, *1234"},
                                 format="json").data["status"] == "review"
    assert as_user(admin).post(f"/api/shop/orders/{oid}/confirm/").data["status"] == "paid"

    purchases = as_user(teacher).get("/api/shop/purchases/").data
    assert purchases[0]["content_url"] == "https://drive.google.com/secret"
    assert as_user(teacher).get(f"/api/shop/products/{product['id']}/").data["content_url"]
    # A digital product can't be bought twice.
    assert as_user(teacher).post("/api/shop/orders/", {"items": [{"product": product["id"]}]}, format="json").status_code == 400


def test_free_product_is_paid_immediately(as_user, teacher, admin):
    pid = as_user(admin).post("/api/shop/products/", {"title": "Bepul namuna", "price": 0,
                                                      "content_url": "https://x.uz/a"}, format="json").data["id"]
    order = as_user(teacher).post("/api/shop/orders/", {"items": [{"product": pid}]}, format="json")
    assert order.data["status"] == "paid"


def test_other_teachers_order_is_private(as_user, make_user, teacher, product):
    oid = as_user(teacher).post("/api/shop/orders/", {"items": [{"product": product["id"]}]}, format="json").data["id"]
    other = make_user("other@example.com", approved=True)
    assert as_user(other).get(f"/api/shop/orders/{oid}/").status_code == 403
    assert as_user(other).post(f"/api/shop/orders/{oid}/cancel/").status_code == 403


def test_physical_order_needs_address_and_stock(as_user, teacher, admin):
    pid = as_user(admin).post("/api/shop/products/", {"title": "Jihoz to'plami", "kind": "jihoz", "delivery": "physical",
                                                      "price": 100000, "stock": 1}, format="json").data["id"]
    assert as_user(teacher).post("/api/shop/orders/", {"items": [{"product": pid}]}, format="json").status_code == 400
    assert as_user(teacher).post("/api/shop/orders/", {"items": [{"product": pid, "quantity": 2}], "phone": "+998901234567",
                                                       "delivery_address": "Toshkent"}, format="json").status_code == 400
    oid = as_user(teacher).post("/api/shop/orders/", {"items": [{"product": pid}], "phone": "+998901234567",
                                                      "delivery_address": "Toshkent"}, format="json").data["id"]
    as_user(admin).post(f"/api/shop/orders/{oid}/confirm/")
    assert Product.objects.get(pk=pid).stock == 0
    assert Order.objects.get(pk=oid).status == "paid"


def test_shop_write_admin_only(as_user, teacher):
    assert as_user(teacher).post("/api/shop/products/", {"title": "x", "price": 1}, format="json").status_code == 403
    assert as_user(teacher).put("/api/shop/settings/", {"card_number": "8600"}, format="json").status_code == 403
