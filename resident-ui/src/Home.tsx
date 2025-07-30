import { useState, useEffect } from "react";
import { Layout, Menu, message, List, Button, Table } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";

const { Content } = Layout;

interface Card {
  rfid: string;
  resident_id: number;
}

const Home: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [refusedCards, setRefusedCards] = useState<Array<{station_id: string; timestamp: string}>>([]);

  const fetchMyCards = () => {
    fetch(`${API_BASE_URL}/cards/my_cards`, {
      credentials: 'include', // Include cookies for authentication
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to fetch cards');
      })
      .then(data => setMyCards(data.cards))
      .catch(error => console.error("Error fetching my cards:", error));
  };

  const fetchRefusedCards = () => {
    fetch(`${API_BASE_URL}/cards/refused`)
      .then(response => response.json())
      .then(data => setRefusedCards(data.refused_cards))
      .catch(error => console.error("Error fetching refused cards:", error));
  };

  useEffect(() => {
    fetchMyCards();
    fetchRefusedCards();
  }, []);

  const handleAddCard = (stationId: string) => {
    fetch(`${API_BASE_URL}/cards/add_card/${stationId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to add card");
        }
        return response.json();
      })
      .then(() => {
        message.success("Card added successfully");
        // Refresh both lists after successful addition
        fetchMyCards();
        fetchRefusedCards();
      })
      .catch(error => {
        console.error("Error adding card:", error);
        message.error("Failed to add card");
      });
  };

  return (
    <Layout style={{ 
      minHeight: "100vh",
      maxWidth: "500px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column"
    }}>
      <Content style={{ 
        flex: 1,
        padding: "16px",
        overflowY: "auto",
        backgroundColor: "#fff"
      }}>
        {activeTab === "home" && (
          <div>
            <h1 style={{ 
              fontSize: "24px",
              marginBottom: "16px"
            }}>
              Charge APT
            </h1>
            
            {/* My Cards Table */}
            <div style={{ marginBottom: "24px" }}>
              <h3>My Cards</h3>
              <Table
                dataSource={myCards}
                columns={[
                  {
                    title: 'RFID',
                    dataIndex: 'rfid',
                    key: 'rfid',
                    render: (rfid: string) => (
                      <span style={{ fontFamily: 'monospace' }}>{rfid}</span>
                    ),
                  },
                  {
                    title: 'Resident ID',
                    dataIndex: 'resident_id',
                    key: 'resident_id',
                  },
                ]}
                pagination={false}
                size="small"
                bordered
                locale={{ emptyText: 'No cards found' }}
              />
            </div>

            {/* Refused Cards List */}
            <List
              header={<h3>Refused Cards</h3>}
              bordered
              dataSource={refusedCards}
              renderItem={item => (
                <List.Item
                  actions={[<Button type="primary" onClick={() => handleAddCard(item.station_id)}>Add Card</Button>]}
                >
                  <div>
                    <strong>Station:</strong> {item.station_id} <br />
                    <strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </Content>

      <Menu
        mode="horizontal"
        selectedKeys={[activeTab]}
        onClick={(e) => setActiveTab(e.key)}
        style={{
          position: "sticky",
          bottom: 0,
          width: "100%",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "center"
        }}
        items={[
          {
            key: "home",
            label: "Charge APT",
            icon: <HomeOutlined />
          }
        ]}
      />
    </Layout>
  );
};

export default Home;
