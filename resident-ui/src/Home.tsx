import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Col, Row } from "antd";
import dayjs from "dayjs";
import { useAuth } from "./contexts/AuthContext";
import { getHouseholdMembers, inviteHouseholdMember, type HouseholdMember } from "./services/householdService";
import { formatAddress } from "./utils/address";
import HouseholdMembersCard from "./components/HouseholdMembersCard";
import UpcomingResidencyLanding from "./components/UpcomingResidencyLanding";
import { calculateMonthlyEnergyStats, getAllCurrentResidentTransactions, type ChargeTransaction } from "./services/chargeTransactionService";
import { addCard, getMyCards, getRefusedCards, updateCardName, type Card as CardType, type RefusedCard } from "./services/cardService";
import { chargingCostService, type Tariff } from "./services/chargingCostService";
import { useStationStatus } from "./hooks/useStationStatus";
import AppHeader from "./components/AppHeader";
import StationStatusCard from "./components/StationStatusCard";
import MonthlyUsageCard from "./components/MonthlyUsageCard";
import UsageSummary from "./components/UsageSummary";
import ChargesCard from "./components/ChargesCard";
import MyCardsCard from "./components/MyCardsCard";
import RefusedCardsCard from "./components/RefusedCardsCard";

const Home: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  // Only a resident can charge. A manager who is not a resident only has the management portal.
  // (The API enforces this too, this only decides what is shown.)
  const isResident = user ? user.roles.includes("resident") : true;
  const residencyState = user?.residency_state ?? null;
  const isUpcoming = isResident && residencyState === "upcoming" && Boolean(user?.residency_start_date);
  const isEnded = isResident && residencyState === "ended";
  const isMainMember = user ? (user.is_main_member ?? user.household_head_id === null) : false;
  // Only the main member of an active or upcoming household can invite household members.
  const canInviteHousehold = isResident && user !== null && isMainMember && !isEnded;
  const address = user ? formatAddress(user) : null;
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdLoading, setHouseholdLoading] = useState(true);
  const station = useStationStatus();
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [cards, setCards] = useState<CardType[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [refusedCards, setRefusedCards] = useState<RefusedCard[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [tariff, setTariff] = useState<Tariff | null>(null);

  const monthlyStats = useMemo(() => calculateMonthlyEnergyStats(transactions), [transactions]);

  const loadTransactions = useCallback(async () => {
    try {
      setTransactions(await getAllCurrentResidentTransactions());
    } catch (error) {
      console.error("Error fetching charge transactions:", error);
      message.error("Failed to load your charging sessions");
    } finally {
      setTransactionsLoading(false);
    }
  }, [message]);

  const loadCards = useCallback(async () => {
    try {
      setCards(await getMyCards());
    } catch (error) {
      console.error("Error fetching my cards:", error);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  const loadRefusedCards = useCallback(async () => {
    try {
      setRefusedCards(await getRefusedCards());
    } catch (error) {
      console.error("Error fetching refused cards:", error);
    }
  }, []);

  const loadRate = useCallback(async () => {
    try {
      const cost = await chargingCostService.getActiveChargingCost();
      setRate(cost.current_kwh_price);
      setTariff(cost.current_tariff);
    } catch (error) {
      console.error("Error fetching active charging cost:", error);
    }
  }, []);

  const loadHouseholdMembers = useCallback(async () => {
    try {
      setHouseholdMembers(await getHouseholdMembers());
    } catch (error) {
      console.error("Error fetching household members:", error);
      message.error("Failed to load your household members");
    } finally {
      setHouseholdLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (!isResident || isUpcoming) return;
    loadTransactions();
    loadCards();
    if (!isEnded) {
      loadRefusedCards();
      loadRate();
    }
  }, [isResident, isUpcoming, isEnded, loadTransactions, loadCards, loadRefusedCards, loadRate]);

  useEffect(() => {
    if (canInviteHousehold) loadHouseholdMembers();
  }, [canInviteHousehold, loadHouseholdMembers]);

  const handleInviteHouseholdMember = async (member: { full_name: string; email: string }) => {
    try {
      await inviteHouseholdMember(member);
      message.success("Invitation sent");
      loadHouseholdMembers();
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to invite household member");
      return false;
    }
  };

  const handleAddCard = async (stationId: string) => {
    try {
      await addCard(stationId);
      message.success("Card added to your account");
      loadCards();
      loadRefusedCards();
    } catch (error) {
      console.error("Error adding card:", error);
      message.error("Failed to add card");
    }
  };

  const handleRenameCard = async (rfid: string, name: string) => {
    try {
      await updateCardName(rfid, name);
      message.success("Card renamed");
      loadCards();
    } catch (error) {
      console.error("Error updating card name:", error);
      message.error("Failed to rename card");
    }
  };

  if (!isResident) {
    return (
      <>
        <AppHeader />
        <main className="page-container">
          <Alert
            type="info"
            showIcon
            message="Your account cannot charge"
            description={
              <>
                Your account is a manager account without charging. You can manage the chargers in the{" "}
                <a href="/management-ui/">management portal</a>.
              </>
            }
          />
        </main>
      </>
    );
  }

  if (isUpcoming && user?.residency_start_date) {
    return (
      <>
        <AppHeader />
        <main className="page-container">
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <UpcomingResidencyLanding
                fullName={user.full_name}
                address={address}
                startDate={user.residency_start_date}
                isMainMember={isMainMember}
              />
            </Col>
            {canInviteHousehold && (
              <Col span={24}>
                <HouseholdMembersCard
                  members={householdMembers}
                  loading={householdLoading}
                  address={address}
                  onInvite={handleInviteHouseholdMember}
                />
              </Col>
            )}
          </Row>
        </main>
      </>
    );
  }

  const formattedEndDate = user?.residency_end_date ? dayjs(user.residency_end_date).format("D MMMM YYYY") : null;

  return (
    <>
      <AppHeader />
      <main className="page-container">
        <Row gutter={[16, 16]}>
          {isEnded && formattedEndDate && (
            <Col span={24}>
              <Alert
                type="warning"
                showIcon
                message={`Your residency ended on ${formattedEndDate}`}
                description="Charging is disabled and your account is read-only. You can still view your past charging sessions and cards."
              />
            </Col>
          )}
          {!isEnded && formattedEndDate && (
            <Col span={24}>
              <Alert
                type="info"
                showIcon
                message={`Your residency ends on ${formattedEndDate}`}
                description="Charging stops automatically after this date. You will still be able to sign in read-only to view your past charging sessions."
              />
            </Col>
          )}
          {!isEnded && (
            <Col xs={24} lg={10}>
              <StationStatusCard {...station} rate={rate} tariff={tariff} />
            </Col>
          )}
          <Col xs={24} lg={isEnded ? 24 : 14}>
            <MonthlyUsageCard stats={monthlyStats} loading={transactionsLoading} />
          </Col>
          <Col span={24}>
            <UsageSummary transactions={transactions} loading={transactionsLoading} />
          </Col>
          <Col span={24}>
            <ChargesCard transactions={transactions} loading={transactionsLoading} />
          </Col>
          <Col xs={24} lg={isEnded ? 24 : 12}>
            <MyCardsCard cards={cards} loading={cardsLoading} onRename={handleRenameCard} readOnly={isEnded} />
          </Col>
          {!isEnded && (
            <Col xs={24} lg={12}>
              <RefusedCardsCard refusedCards={refusedCards} onAdd={handleAddCard} />
            </Col>
          )}
          {canInviteHousehold && (
            <Col span={24}>
              <HouseholdMembersCard
                members={householdMembers}
                loading={householdLoading}
                address={address}
                onInvite={handleInviteHouseholdMember}
              />
            </Col>
          )}
        </Row>
      </main>
    </>
  );
};

export default Home;
